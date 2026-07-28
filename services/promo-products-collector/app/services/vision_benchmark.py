from __future__ import annotations

import base64
import json
import math
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Protocol
from urllib.parse import quote, urlsplit

from app.collectors.eleclerc_reunion import CatalogReference, discover_catalogs
from app.extractors.catalog_page_regions import PageRegion, detect_regions
from app.extractors.catalog_product_ocr import CatalogProductOcr, OcrPage, RapidOcrCliClient
from app.extractors.fliphtml5_pages import PageAsset, discover_viewer, extract_page_assets
from app.models.promotion_candidate import BoundingBox
from app.settings import Settings


ALLOWED_OFFER_MECHANISMS = (
    "simple_price",
    "direct_discount",
    "loyalty_credit",
    "percentage_discount",
    "multi_buy",
    "second_item_discount",
    "free_item",
    "starting_from",
    "unknown",
)


@dataclass(frozen=True)
class CatalogDiscoveryReport:
    catalog_slug: str
    title: str
    viewer_url: str
    selected: bool
    ignored_reason: str | None


@dataclass(frozen=True)
class VisionBoundingBox:
    left: float
    top: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.left + self.width

    @property
    def bottom(self) -> float:
        return self.top + self.height

    def translated(self, offset_left: float, offset_top: float) -> "VisionBoundingBox":
        return VisionBoundingBox(
            left=self.left + offset_left,
            top=self.top + offset_top,
            width=self.width,
            height=self.height,
        )

    def overlap_ratio(self, other: "VisionBoundingBox") -> float:
        horizontal = max(0.0, min(self.right, other.right) - max(self.left, other.left))
        vertical = max(0.0, min(self.bottom, other.bottom) - max(self.top, other.top))
        intersection = horizontal * vertical
        if intersection <= 0:
            return 0.0
        self_area = max(self.width * self.height, 1.0)
        other_area = max(other.width * other.height, 1.0)
        return intersection / min(self_area, other_area)

    def to_dict(self) -> dict[str, float]:
        return {
            "left": round(self.left, 3),
            "top": round(self.top, 3),
            "width": round(self.width, 3),
            "height": round(self.height, 3),
        }


@dataclass(frozen=True)
class VisionOffer:
    page_number: int
    bounding_box: VisionBoundingBox
    product_name: str | None
    brand: str | None
    package_format: str | None
    quantity_value: float | None
    quantity_unit: str | None
    promo_price: float | None
    original_price: float | None
    unit_price: float | None
    unit_price_unit: str | None
    loyalty_amount: float | None
    loyalty_type: str | None
    discount_percent: float | None
    offer_mechanism: str
    conditions: str | None
    confidence: float | None
    visual_evidence_notes: str | None

    def translated(self, offset_left: float, offset_top: float, *, page_number: int | None = None) -> "VisionOffer":
        return VisionOffer(
            page_number=self.page_number if page_number is None else page_number,
            bounding_box=self.bounding_box.translated(offset_left, offset_top),
            product_name=self.product_name,
            brand=self.brand,
            package_format=self.package_format,
            quantity_value=self.quantity_value,
            quantity_unit=self.quantity_unit,
            promo_price=self.promo_price,
            original_price=self.original_price,
            unit_price=self.unit_price,
            unit_price_unit=self.unit_price_unit,
            loyalty_amount=self.loyalty_amount,
            loyalty_type=self.loyalty_type,
            discount_percent=self.discount_percent,
            offer_mechanism=self.offer_mechanism,
            conditions=self.conditions,
            confidence=self.confidence,
            visual_evidence_notes=self.visual_evidence_notes,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "page_number": self.page_number,
            "bounding_box": self.bounding_box.to_dict(),
            "product_name": self.product_name,
            "brand": self.brand,
            "package_format": self.package_format,
            "quantity_value": self.quantity_value,
            "quantity_unit": self.quantity_unit,
            "promo_price": self.promo_price,
            "original_price": self.original_price,
            "unit_price": self.unit_price,
            "unit_price_unit": self.unit_price_unit,
            "loyalty_amount": self.loyalty_amount,
            "loyalty_type": self.loyalty_type,
            "discount_percent": self.discount_percent,
            "offer_mechanism": self.offer_mechanism,
            "conditions": self.conditions,
            "confidence": self.confidence,
            "visual_evidence_notes": self.visual_evidence_notes,
        }


@dataclass(frozen=True)
class VisionSlice:
    slice_id: str
    page_number: int
    strategy: str
    image_path: Path
    origin_left: float
    origin_top: float
    width: float
    height: float
    metadata: dict[str, object]


@dataclass(frozen=True)
class VisionClientResponse:
    payload: dict[str, object]
    duration_seconds: float
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    estimated_cost_eur: float | None = None
    model: str | None = None
    provider: str | None = None


@dataclass(frozen=True)
class StrategyPageBenchmarkResult:
    page_number: int
    strategy: str
    calls: int
    duration_seconds: float
    estimated_cost_eur: float | None
    offers_detected: int
    offers_complete: int
    offers_incomplete: int
    duplicates: int
    errors: list[str]
    correct_product_price_associations: int | None
    false_product_price_associations: int | None
    input_tokens: int | None
    output_tokens: int | None
    offers: list[VisionOffer]

    def to_dict(self) -> dict[str, object]:
        return {
            "page_number": self.page_number,
            "strategy": self.strategy,
            "calls": self.calls,
            "duration_seconds": self.duration_seconds,
            "estimated_cost_eur": self.estimated_cost_eur,
            "offers_detected": self.offers_detected,
            "offers_complete": self.offers_complete,
            "offers_incomplete": self.offers_incomplete,
            "duplicates": self.duplicates,
            "errors": list(self.errors),
            "correct_product_price_associations": self.correct_product_price_associations,
            "false_product_price_associations": self.false_product_price_associations,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "offers": [offer.to_dict() for offer in self.offers],
        }


@dataclass(frozen=True)
class StrategyBenchmarkSummary:
    strategy: str
    calls: int
    duration_seconds: float
    estimated_cost_eur: float | None
    offers_detected: int
    offers_complete: int
    offers_incomplete: int
    duplicates: int
    errors: int
    page_results: list[StrategyPageBenchmarkResult]

    def to_dict(self) -> dict[str, object]:
        return {
            "strategy": self.strategy,
            "calls": self.calls,
            "duration_seconds": self.duration_seconds,
            "estimated_cost_eur": self.estimated_cost_eur,
            "offers_detected": self.offers_detected,
            "offers_complete": self.offers_complete,
            "offers_incomplete": self.offers_incomplete,
            "duplicates": self.duplicates,
            "errors": self.errors,
            "page_results": [result.to_dict() for result in self.page_results],
        }


@dataclass(frozen=True)
class VisionBenchmarkRunReport:
    source_url: str
    catalog_slug: str
    catalog_title: str
    viewer_url: str
    config_url: str
    total_detected_pages: int
    pages_processed: list[int]
    provider: str
    model: str
    strategies: list[StrategyBenchmarkSummary]
    detected_catalogs: list[CatalogDiscoveryReport]
    total_calls: int
    total_estimated_cost_eur: float | None
    temporary_files_remaining: int
    duration_seconds: float
    report_path: str
    errors: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "catalogue": {
                "source_url": self.source_url,
                "catalog_slug": self.catalog_slug,
                "catalog_title": self.catalog_title,
                "viewer_url": self.viewer_url,
                "config_url": self.config_url,
                "total_detected_pages": self.total_detected_pages,
                "pages_processed": list(self.pages_processed),
            },
            "provider": self.provider,
            "model": self.model,
            "duration_seconds": self.duration_seconds,
            "total_calls": self.total_calls,
            "total_estimated_cost_eur": self.total_estimated_cost_eur,
            "temporary_files_remaining": self.temporary_files_remaining,
            "errors": list(self.errors),
            "detected_catalogs": [asdict(item) for item in self.detected_catalogs],
            "strategies": [strategy.to_dict() for strategy in self.strategies],
            "report_path": self.report_path,
        }


@dataclass(frozen=True)
class VisionCheckpointRecord:
    page_number: int
    strategy: str
    status: str
    calls: int
    estimated_cost_eur: float | None
    duration_seconds: float
    offers_detected: int
    offers_complete: int
    offers_incomplete: int
    duplicates: int
    input_tokens: int | None
    output_tokens: int | None
    errors: list[str]
    result: StrategyPageBenchmarkResult | None
    error: str | None
    updated_at: str

    def to_dict(self) -> dict[str, object]:
        return {
            "page_number": self.page_number,
            "strategy": self.strategy,
            "status": self.status,
            "calls": self.calls,
            "estimated_cost_eur": self.estimated_cost_eur,
            "duration_seconds": self.duration_seconds,
            "offers_detected": self.offers_detected,
            "offers_complete": self.offers_complete,
            "offers_incomplete": self.offers_incomplete,
            "duplicates": self.duplicates,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "errors": list(self.errors),
            "result": self.result.to_dict() if self.result is not None else None,
            "error": self.error,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, object]) -> "VisionCheckpointRecord":
        page_number = _coerce_int(payload.get("page_number"))
        strategy = _coerce_optional_string(payload.get("strategy"))
        status = _coerce_optional_string(payload.get("status"))
        if page_number is None or strategy is None or status is None:
            raise ValueError("vision_checkpoint_missing_identity")
        result_payload = payload.get("result")
        result = _strategy_page_result_from_dict(result_payload) if isinstance(result_payload, dict) else None
        return cls(
            page_number=page_number,
            strategy=strategy,
            status=status,
            calls=_coerce_int(payload.get("calls")) or 0,
            estimated_cost_eur=_coerce_number(payload.get("estimated_cost_eur")),
            duration_seconds=_coerce_number(payload.get("duration_seconds")) or 0.0,
            offers_detected=_coerce_int(payload.get("offers_detected")) or 0,
            offers_complete=_coerce_int(payload.get("offers_complete")) or 0,
            offers_incomplete=_coerce_int(payload.get("offers_incomplete")) or 0,
            duplicates=_coerce_int(payload.get("duplicates")) or 0,
            input_tokens=_coerce_int(payload.get("input_tokens")),
            output_tokens=_coerce_int(payload.get("output_tokens")),
            errors=[str(item) for item in payload.get("errors", [])] if isinstance(payload.get("errors"), list) else [],
            result=result,
            error=_coerce_optional_string(payload.get("error")),
            updated_at=_coerce_optional_string(payload.get("updated_at")) or "",
        )


class CheckpointStore(Protocol):
    def load_records(self) -> dict[tuple[int, str], VisionCheckpointRecord]: ...
    def write_record(self, record: VisionCheckpointRecord) -> str: ...
    def write_report(self, payload: dict[str, object]) -> str: ...


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> Any: ...
    def fetch_binary(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> Any: ...


class VisionModelClient(Protocol):
    def extract_offers(self, *, image_path: Path, prompt: str) -> VisionClientResponse: ...


class ImageRuntime(Protocol):
    def create_tile_slices(
        self,
        *,
        source_image_path: Path,
        page_number: int,
        page_width: int,
        page_height: int,
        overlap_percent: int,
        output_dir: Path,
    ) -> list[VisionSlice]: ...

    def create_anchor_crop_slices(
        self,
        *,
        source_image_path: Path,
        page_number: int,
        page_width: int,
        page_height: int,
        regions: list[PageRegion],
        output_dir: Path,
    ) -> list[VisionSlice]: ...


class LocalCheckpointStore:
    def __init__(self, *, root_dir: Path, run_id: str) -> None:
        self.root_dir = Path(root_dir)
        self.run_id = run_id

    @property
    def run_root(self) -> Path:
        return self.root_dir / self.run_id

    @property
    def checkpoint_dir(self) -> Path:
        return self.run_root / "checkpoints"

    @property
    def aggregate_report_path(self) -> Path:
        return self.run_root / "vision-benchmark-report.json"

    def load_records(self) -> dict[tuple[int, str], VisionCheckpointRecord]:
        records: dict[tuple[int, str], VisionCheckpointRecord] = {}
        if not self.checkpoint_dir.exists():
            return records
        for path in sorted(self.checkpoint_dir.glob("page-*-strategy-*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            record = VisionCheckpointRecord.from_dict(payload)
            records[(record.page_number, record.strategy)] = record
        return records

    def write_record(self, record: VisionCheckpointRecord) -> str:
        path = self.checkpoint_dir / f"page-{record.page_number:03d}-strategy-{record.strategy}.json"
        _write_report_json(path, record.to_dict())
        return str(path)

    def write_report(self, payload: dict[str, object]) -> str:
        _write_report_json(self.aggregate_report_path, payload)
        return str(self.aggregate_report_path)


class GcsCheckpointStore:
    def __init__(self, *, bucket: str, prefix: str, run_id: str) -> None:
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.run_id = run_id

    def load_records(self) -> dict[tuple[int, str], VisionCheckpointRecord]:
        records: dict[tuple[int, str], VisionCheckpointRecord] = {}
        for object_name in self._list_objects(prefix=f"{self._run_prefix()}/checkpoints/"):
            if not object_name.endswith(".json"):
                continue
            payload = self._download_json(object_name)
            record = VisionCheckpointRecord.from_dict(payload)
            records[(record.page_number, record.strategy)] = record
        return records

    def write_record(self, record: VisionCheckpointRecord) -> str:
        object_name = f"{self._run_prefix()}/checkpoints/page-{record.page_number:03d}-strategy-{record.strategy}.json"
        self._upload_json(object_name, record.to_dict())
        return f"gs://{self.bucket}/{object_name}"

    def write_report(self, payload: dict[str, object]) -> str:
        object_name = f"{self._run_prefix()}/vision-benchmark-report.json"
        self._upload_json(object_name, payload)
        return f"gs://{self.bucket}/{object_name}"

    def _run_prefix(self) -> str:
        if self.prefix:
            return f"{self.prefix}/{self.run_id}"
        return self.run_id

    def _list_objects(self, *, prefix: str) -> list[str]:
        object_names: list[str] = []
        page_token: str | None = None
        while True:
            query = f"prefix={quote(prefix, safe='')}"
            if page_token:
                query = f"{query}&pageToken={quote(page_token, safe='')}"
            request = urllib.request.Request(
                f"https://storage.googleapis.com/storage/v1/b/{quote(self.bucket, safe='')}/o?{query}",
                headers=self._auth_headers(),
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            for item in payload.get("items", []) if isinstance(payload.get("items"), list) else []:
                if isinstance(item, dict) and isinstance(item.get("name"), str):
                    object_names.append(str(item["name"]))
            next_token = payload.get("nextPageToken")
            if not isinstance(next_token, str) or not next_token:
                break
            page_token = next_token
        return object_names

    def _download_json(self, object_name: str) -> dict[str, object]:
        request = urllib.request.Request(
            f"https://storage.googleapis.com/storage/v1/b/{quote(self.bucket, safe='')}/o/{quote(object_name, safe='')}?alt=media",
            headers=self._auth_headers(),
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    def _upload_json(self, object_name: str, payload: dict[str, object]) -> None:
        request = urllib.request.Request(
            (
                "https://storage.googleapis.com/upload/storage/v1/b/"
                f"{quote(self.bucket, safe='')}/o?uploadType=media&name={quote(object_name, safe='')}"
            ),
            data=json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
            headers={
                **self._auth_headers(),
                "Content-Type": "application/json; charset=utf-8",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30):
            return

    @staticmethod
    def _auth_headers() -> dict[str, str]:
        token = _load_gcp_access_token()
        return {"Authorization": f"Bearer {token}"}


class HttpFetcher:
    def __init__(self) -> None:
        self._last_domain_fetch: dict[str, float] = {}

    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> Any:
        content, content_type = self._read(url, allowed_hosts=allowed_hosts, settings=settings)
        return SimpleNamespace(url=url, content_type=content_type, text=content.decode("utf-8", errors="ignore"))

    def fetch_binary(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> Any:
        content, content_type = self._read(url, allowed_hosts=allowed_hosts, settings=settings)
        return SimpleNamespace(url=url, content_type=content_type, content=content)

    def _read(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> tuple[bytes, str | None]:
        self._enforce_allowed_host(url, allowed_hosts)
        host = urlsplit(url).hostname or ""
        now = time.monotonic()
        last_fetch = self._last_domain_fetch.get(host)
        if last_fetch is not None:
            delta = now - last_fetch
            if delta < settings.domain_delay_seconds:
                time.sleep(settings.domain_delay_seconds - delta)
        request = urllib.request.Request(url, headers={"User-Agent": settings.user_agent})
        try:
            with urllib.request.urlopen(request, timeout=settings.request_timeout_seconds) as response:
                self._last_domain_fetch[host] = time.monotonic()
                return response.read(), response.headers.get("Content-Type")
        except urllib.error.HTTPError as exc:  # pragma: no cover - network path
            raise RuntimeError(f"http_error:{exc.code}:{url}") from exc

    @staticmethod
    def _enforce_allowed_host(url: str, allowed_hosts: set[str]) -> None:
        host = (urlsplit(url).hostname or "").lower()
        normalized = {item.lower() for item in allowed_hosts}
        if host not in normalized:
            raise ValueError(f"url_out_of_allowed_domain:{url}")


class OpenAiVisionClient:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        input_price_eur_per_1m_tokens: float | None,
        output_price_eur_per_1m_tokens: float | None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.input_price_eur_per_1m_tokens = input_price_eur_per_1m_tokens
        self.output_price_eur_per_1m_tokens = output_price_eur_per_1m_tokens

    def extract_offers(self, *, image_path: Path, prompt: str) -> VisionClientResponse:
        started = time.perf_counter()
        mime_type = _guess_mime_type(image_path)
        image_b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
        request_payload = {
            "model": self.model,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {
                            "type": "input_image",
                            "image_url": f"data:{mime_type};base64,{image_b64}",
                            "detail": "high",
                        },
                    ],
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "promo_catalog_offers",
                    "strict": True,
                    "schema": _vision_response_schema(),
                }
            },
        }
        body = json.dumps(request_payload).encode("utf-8")
        request = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:  # pragma: no cover - network path
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"openai_http_error:{exc.code}:{detail[:240]}") from exc
        except urllib.error.URLError as exc:  # pragma: no cover - network path
            raise RuntimeError(f"openai_request_failed:{exc.reason}") from exc

        output_text = str(payload.get("output_text") or "").strip()
        if not output_text:
            output_text = _extract_openai_output_text(payload)
        if not output_text:
            raise RuntimeError("openai_missing_output_text")
        response_payload = json.loads(output_text)
        usage = payload.get("usage") or {}
        input_tokens = _coerce_int(usage.get("input_tokens"))
        output_tokens = _coerce_int(usage.get("output_tokens"))
        total_tokens = _coerce_int(usage.get("total_tokens"))
        estimated_cost = _estimate_openai_cost(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_price_eur_per_1m_tokens=self.input_price_eur_per_1m_tokens,
            output_price_eur_per_1m_tokens=self.output_price_eur_per_1m_tokens,
        )
        return VisionClientResponse(
            payload=response_payload,
            duration_seconds=round(time.perf_counter() - started, 3),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost_eur=estimated_cost,
            model=self.model,
            provider="openai",
        )


class SubprocessImageRuntime:
    def __init__(self, *, python_executable: Path, service_root: Path | None = None) -> None:
        self.python_executable = Path(python_executable)
        self.service_root = service_root or Path(__file__).resolve().parents[2]

    def create_tile_slices(
        self,
        *,
        source_image_path: Path,
        page_number: int,
        page_width: int,
        page_height: int,
        overlap_percent: int,
        output_dir: Path,
    ) -> list[VisionSlice]:
        slices: list[VisionSlice] = []
        for row, col, box in build_strategy_b_tile_boxes(
            page_width=page_width,
            page_height=page_height,
            overlap_percent=overlap_percent,
        ):
            image_path = output_dir / f"page-{page_number:03d}-tile-r{row + 1}c{col + 1}.png"
            self._crop(source_image_path, image_path, box)
            slices.append(
                VisionSlice(
                    slice_id=f"page-{page_number:03d}-tile-r{row + 1}c{col + 1}",
                    page_number=page_number,
                    strategy="B",
                    image_path=image_path,
                    origin_left=box.left,
                    origin_top=box.top,
                    width=box.width,
                    height=box.height,
                    metadata={"row": row, "column": col},
                )
            )
        return slices

    def create_anchor_crop_slices(
        self,
        *,
        source_image_path: Path,
        page_number: int,
        page_width: int,
        page_height: int,
        regions: list[PageRegion],
        output_dir: Path,
    ) -> list[VisionSlice]:
        slices: list[VisionSlice] = []
        for index, region in enumerate(regions, start=1):
            box = build_strategy_c_crop_box(region, page_width=page_width, page_height=page_height)
            image_path = output_dir / f"page-{page_number:03d}-crop-{index:03d}.png"
            self._crop(source_image_path, image_path, box)
            slices.append(
                VisionSlice(
                    slice_id=f"page-{page_number:03d}-crop-{index:03d}",
                    page_number=page_number,
                    strategy="C",
                    image_path=image_path,
                    origin_left=box.left,
                    origin_top=box.top,
                    width=box.width,
                    height=box.height,
                    metadata={"region_id": region.region_id},
                )
            )
        return slices

    def _crop(self, source_image_path: Path, output_path: Path, box: VisionBoundingBox) -> None:
        if not self.python_executable.is_file():
            raise RuntimeError(f"vision_image_runtime_missing:{self.python_executable}")
        command = [
            str(self.python_executable),
            "-m",
            "app.services.vision_image_helper",
            "--source",
            str(source_image_path),
            "--output",
            str(output_path),
            "--left",
            str(int(math.floor(box.left))),
            "--top",
            str(int(math.floor(box.top))),
            "--width",
            str(int(math.ceil(box.width))),
            "--height",
            str(int(math.ceil(box.height))),
        ]
        try:
            subprocess.run(
                command,
                cwd=self.service_root,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=True,
            )
        except subprocess.CalledProcessError as exc:  # pragma: no cover - exercised in real run only
            detail = exc.stderr.strip() or exc.stdout.strip() or "unknown crop failure"
            raise RuntimeError(f"vision_crop_failed:{detail}") from exc


class VisionBudgetController:
    def __init__(
        self,
        *,
        max_calls: int,
        max_cost_eur: float | None,
        initial_calls: int = 0,
        initial_cost_eur: float = 0.0,
    ) -> None:
        self.max_calls = max_calls
        self.max_cost_eur = max_cost_eur
        self.calls_made = initial_calls
        self.cost_spent_eur = round(initial_cost_eur, 6)

    def ensure_can_call(self) -> None:
        if self.calls_made >= self.max_calls:
            raise RuntimeError("vision_max_calls_reached")
        if self.max_cost_eur is not None and self.cost_spent_eur >= self.max_cost_eur:
            raise RuntimeError("vision_budget_reached")

    def register(self, *, estimated_cost_eur: float | None) -> None:
        self.calls_made += 1
        if estimated_cost_eur is not None:
            self.cost_spent_eur = round(self.cost_spent_eur + estimated_cost_eur, 6)
        if self.max_cost_eur is not None and self.cost_spent_eur > self.max_cost_eur:
            raise RuntimeError("vision_budget_reached")


def run_vision_benchmark(
    settings: Settings,
    *,
    fetcher: Fetcher | None = None,
    ocr_client: CatalogProductOcr | None = None,
    vision_client: VisionModelClient | None = None,
    image_runtime: ImageRuntime | None = None,
) -> VisionBenchmarkRunReport:
    if settings.extraction_mode != "local":
        raise RuntimeError(f"unsupported_extraction_mode:{settings.extraction_mode}")
    if not settings.vision_enabled:
        raise RuntimeError("vision_disabled")
    if len(settings.selected_page_numbers) != 3:
        raise RuntimeError("vision_benchmark_requires_exactly_three_pages")
    if settings.vision_max_pages != 3:
        raise RuntimeError("vision_benchmark_requires_three_max_pages")

    started = time.perf_counter()
    fetcher = fetcher or HttpFetcher()
    ocr_client = ocr_client or RapidOcrCliClient(python_executable=settings.ocr_python_executable)
    vision_client = vision_client or build_vision_client(settings)
    image_runtime = image_runtime or SubprocessImageRuntime(python_executable=settings.ocr_python_executable)
    checkpoint_store = _build_checkpoint_store(settings)
    existing_records = checkpoint_store.load_records()
    completed_records = [
        record for record in existing_records.values() if record.status == "completed" and record.result is not None
    ]
    budget = VisionBudgetController(
        max_calls=settings.vision_max_calls,
        max_cost_eur=settings.vision_max_cost_eur,
        initial_calls=sum(record.calls for record in completed_records),
        initial_cost_eur=sum(record.estimated_cost_eur or 0.0 for record in completed_records),
    )
    allowed_hosts = {settings.official_domain.lower(), f"www.{settings.official_domain.lower()}"}
    errors: list[str] = []
    detected_reports: list[CatalogDiscoveryReport] = []
    catalog_slug = settings.target_catalog_slug
    catalog_title = ""
    viewer_url = ""
    config_url = ""
    total_detected_pages = 0
    strategy_results: dict[str, list[StrategyPageBenchmarkResult]] = {"A": [], "B": [], "C": []}
    checkpoint_report_path = str(settings.vision_report_path)
    selected_assets: list[PageAsset] = []
    report: VisionBenchmarkRunReport | None = None

    _cleanup_temp_dir(settings.temp_dir)
    settings.temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        detected_reports, selected_catalogs = _discover_catalog_selection(settings, fetcher, allowed_hosts=allowed_hosts)
        if not selected_catalogs:
            raise RuntimeError(f"catalog_not_found:{settings.target_catalog_slug}")
        catalog = selected_catalogs[0]
        catalog_slug = catalog.catalog_slug
        catalog_title = catalog.title
        viewer, page_assets = _fetch_catalog_assets(catalog, settings, fetcher, allowed_hosts=allowed_hosts)
        viewer_url = catalog.viewer_url
        config_url = viewer.config_url
        total_detected_pages = len(page_assets)
        selected_assets = _select_page_assets(page_assets, settings)
        if len(selected_assets) != 3:
            raise RuntimeError("vision_benchmark_selected_pages_not_found")

        page_source_paths: dict[int, Path] = {}
        ocr_pages: dict[int, OcrPage] = {}
        selected_page_numbers = [page.page_number for page in selected_assets]
        selected_page_set = set(selected_page_numbers)
        page_regions_for_strategy_c: dict[int, list[PageRegion]] = {}

        for page in selected_assets:
            binary = fetcher.fetch_binary(page.asset_url, allowed_hosts=allowed_hosts, settings=settings)
            source_path = _write_temp_page_asset(settings.temp_dir, page.page_number, page.asset_url, binary.content_type, binary.content)
            page_source_paths[page.page_number] = source_path
            ocr_page = ocr_client.analyze_image(source_path, page_number=page.page_number)
            ocr_pages[page.page_number] = ocr_page
            page_regions_for_strategy_c[page.page_number] = select_strategy_c_regions(
                detect_regions(ocr_page, layout_type="mixed_layout")
            )

        for strategy_name in ("A", "B", "C"):
            for page_number in selected_page_numbers:
                checkpoint = existing_records.get((page_number, strategy_name))
                if checkpoint is None:
                    continue
                if checkpoint.status == "completed" and checkpoint.result is not None:
                    strategy_results[strategy_name].append(checkpoint.result)
                elif checkpoint.error:
                    errors.append(f"checkpoint:{page_number}:{strategy_name}:{checkpoint.error}")

        planned_strategy_c_regions = _plan_strategy_c_regions(
            page_regions=page_regions_for_strategy_c,
            page_numbers=selected_page_numbers,
            existing_records=existing_records,
            max_calls=settings.vision_max_calls,
        )

        checkpoint_report_path = _write_progress_reports(
            settings=settings,
            checkpoint_store=checkpoint_store,
            source_url=settings.source_url,
            catalog_slug=catalog_slug,
            catalog_title=catalog_title,
            viewer_url=viewer_url,
            config_url=config_url,
            total_detected_pages=total_detected_pages,
            selected_assets=selected_assets,
            strategy_results=strategy_results,
            detected_reports=detected_reports,
            errors=errors,
            started=started,
            report_path=checkpoint_report_path,
        )

        for page in selected_assets:
            ocr_page = ocr_pages[page.page_number]
            for strategy_name in ("A", "B", "C"):
                if _has_completed_checkpoint(existing_records, page_number=page.page_number, strategy=strategy_name):
                    continue
                try:
                    if strategy_name == "A":
                        result = _run_strategy_for_page(
                            page_number=page.page_number,
                            strategy="A",
                            slices=[
                                VisionSlice(
                                    slice_id=f"page-{page.page_number:03d}-full",
                                    page_number=page.page_number,
                                    strategy="A",
                                    image_path=page_source_paths[page.page_number],
                                    origin_left=0,
                                    origin_top=0,
                                    width=ocr_page.image_width,
                                    height=ocr_page.image_height,
                                    metadata={"mode": "full_page"},
                                )
                            ],
                            budget=budget,
                            vision_client=vision_client,
                            page_context="full page",
                        )
                    elif strategy_name == "B":
                        result = _run_strategy_for_page(
                            page_number=page.page_number,
                            strategy="B",
                            slices=image_runtime.create_tile_slices(
                                source_image_path=page_source_paths[page.page_number],
                                page_number=page.page_number,
                                page_width=ocr_page.image_width,
                                page_height=ocr_page.image_height,
                                overlap_percent=settings.vision_tile_overlap_percent,
                                output_dir=settings.temp_dir / f"page-{page.page_number:03d}" / "tiles",
                            ),
                            budget=budget,
                            vision_client=vision_client,
                            page_context="2x2 tiled page",
                        )
                    else:
                        result = _run_strategy_for_page(
                            page_number=page.page_number,
                            strategy="C",
                            slices=image_runtime.create_anchor_crop_slices(
                                source_image_path=page_source_paths[page.page_number],
                                page_number=page.page_number,
                                page_width=ocr_page.image_width,
                                page_height=ocr_page.image_height,
                                regions=planned_strategy_c_regions.get(page.page_number, []),
                                output_dir=settings.temp_dir / f"page-{page.page_number:03d}" / "crops",
                            ),
                            budget=budget,
                            vision_client=vision_client,
                            page_context="price-anchor crop",
                        )
                    strategy_results[strategy_name].append(result)
                    existing_records[(page.page_number, strategy_name)] = _checkpoint_record_from_result(result)
                except Exception as exc:  # pragma: no cover - exercised in real run only
                    error_message = str(exc)
                    errors.append(f"page-{page.page_number}:{strategy_name}:{error_message}")
                    existing_records[(page.page_number, strategy_name)] = _checkpoint_record_from_error(
                        page_number=page.page_number,
                        strategy=strategy_name,
                        error_message=error_message,
                    )
                checkpoint_store.write_record(existing_records[(page.page_number, strategy_name)])
                checkpoint_report_path = _write_progress_reports(
                    settings=settings,
                    checkpoint_store=checkpoint_store,
                    source_url=settings.source_url,
                    catalog_slug=catalog_slug,
                    catalog_title=catalog_title,
                    viewer_url=viewer_url,
                    config_url=config_url,
                    total_detected_pages=total_detected_pages,
                    selected_assets=selected_assets,
                    strategy_results=strategy_results,
                    detected_reports=detected_reports,
                    errors=errors,
                    started=started,
                    report_path=checkpoint_report_path,
                )

        report = _build_vision_report(
            source_url=settings.source_url,
            catalog_slug=catalog_slug,
            catalog_title=catalog_title,
            viewer_url=viewer_url,
            config_url=config_url,
            total_detected_pages=total_detected_pages,
            selected_assets=selected_assets,
            strategy_results=strategy_results,
            detected_reports=detected_reports,
            errors=errors,
            started=started,
            temporary_files_remaining=0,
            report_path=checkpoint_report_path,
            provider=settings.vision_provider,
            model=settings.vision_model,
        )
        _write_report_json(settings.vision_report_path, report.to_dict())
        checkpoint_report_path = checkpoint_store.write_report(report.to_dict())
    finally:
        _cleanup_temp_dir(settings.temp_dir)

    final_report = report or _build_vision_report(
        source_url=settings.source_url,
        catalog_slug=catalog_slug,
        catalog_title=catalog_title,
        viewer_url=viewer_url,
        config_url=config_url,
        total_detected_pages=total_detected_pages,
        selected_assets=selected_assets,
        strategy_results=strategy_results,
        detected_reports=detected_reports,
        errors=errors,
        started=started,
        temporary_files_remaining=_count_temporary_files(settings.temp_dir),
        report_path=checkpoint_report_path,
        provider=settings.vision_provider,
        model=settings.vision_model,
    )
    return VisionBenchmarkRunReport(
        source_url=final_report.source_url,
        catalog_slug=final_report.catalog_slug,
        catalog_title=final_report.catalog_title,
        viewer_url=final_report.viewer_url,
        config_url=final_report.config_url,
        total_detected_pages=final_report.total_detected_pages,
        pages_processed=final_report.pages_processed,
        provider=final_report.provider,
        model=final_report.model,
        strategies=final_report.strategies,
        detected_catalogs=final_report.detected_catalogs,
        total_calls=final_report.total_calls,
        total_estimated_cost_eur=final_report.total_estimated_cost_eur,
        temporary_files_remaining=_count_temporary_files(settings.temp_dir),
        duration_seconds=final_report.duration_seconds,
        report_path=checkpoint_report_path,
        errors=final_report.errors,
    )


def build_vision_client(settings: Settings) -> VisionModelClient:
    if settings.vision_provider != "openai":
        raise RuntimeError(f"unsupported_vision_provider:{settings.vision_provider or 'missing'}")
    if not settings.vision_model:
        raise RuntimeError("missing_vision_model")
    api_key = (Path.cwd(),)  # keep static analyzers honest about side effects
    del api_key
    openai_api_key = _load_env_value("OPENAI_API_KEY")
    if not openai_api_key:
        raise RuntimeError("missing_openai_api_key")
    return OpenAiVisionClient(
        api_key=openai_api_key,
        model=settings.vision_model,
        input_price_eur_per_1m_tokens=settings.vision_input_price_eur_per_1m_tokens,
        output_price_eur_per_1m_tokens=settings.vision_output_price_eur_per_1m_tokens,
    )


def _build_checkpoint_store(settings: Settings) -> CheckpointStore:
    run_id = _build_benchmark_run_id(settings)
    backend = settings.vision_checkpoint_backend or "local"
    if backend == "local":
        return LocalCheckpointStore(root_dir=settings.vision_checkpoint_local_root, run_id=run_id)
    if backend == "gcs":
        if not settings.vision_checkpoint_bucket:
            raise RuntimeError("missing_vision_checkpoint_bucket")
        return GcsCheckpointStore(
            bucket=settings.vision_checkpoint_bucket,
            prefix=settings.vision_checkpoint_prefix,
            run_id=run_id,
        )
    raise RuntimeError(f"unsupported_vision_checkpoint_backend:{backend}")


def _build_benchmark_run_id(settings: Settings) -> str:
    page_suffix = "-".join(f"{page:03d}" for page in settings.selected_page_numbers) or "no-pages"
    return f"{settings.target_catalog_slug.lower()}-{page_suffix}"


def _has_completed_checkpoint(
    existing_records: dict[tuple[int, str], VisionCheckpointRecord],
    *,
    page_number: int,
    strategy: str,
) -> bool:
    checkpoint = existing_records.get((page_number, strategy))
    return checkpoint is not None and checkpoint.status == "completed" and checkpoint.result is not None


def _checkpoint_record_from_result(result: StrategyPageBenchmarkResult) -> VisionCheckpointRecord:
    return VisionCheckpointRecord(
        page_number=result.page_number,
        strategy=result.strategy,
        status="completed",
        calls=result.calls,
        estimated_cost_eur=result.estimated_cost_eur,
        duration_seconds=result.duration_seconds,
        offers_detected=result.offers_detected,
        offers_complete=result.offers_complete,
        offers_incomplete=result.offers_incomplete,
        duplicates=result.duplicates,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        errors=list(result.errors),
        result=result,
        error=None,
        updated_at=_utc_now_iso(),
    )


def _checkpoint_record_from_error(*, page_number: int, strategy: str, error_message: str) -> VisionCheckpointRecord:
    return VisionCheckpointRecord(
        page_number=page_number,
        strategy=strategy,
        status="failed",
        calls=0,
        estimated_cost_eur=None,
        duration_seconds=0.0,
        offers_detected=0,
        offers_complete=0,
        offers_incomplete=0,
        duplicates=0,
        input_tokens=None,
        output_tokens=None,
        errors=[],
        result=None,
        error=error_message,
        updated_at=_utc_now_iso(),
    )


def _plan_strategy_c_regions(
    *,
    page_regions: dict[int, list[PageRegion]],
    page_numbers: list[int],
    existing_records: dict[tuple[int, str], VisionCheckpointRecord],
    max_calls: int,
) -> dict[int, list[PageRegion]]:
    completed_calls = sum(
        record.calls
        for record in existing_records.values()
        if record.status == "completed"
    )
    missing_a_calls = sum(1 for page_number in page_numbers if not _has_completed_checkpoint(existing_records, page_number=page_number, strategy="A"))
    missing_b_calls = sum(4 for page_number in page_numbers if not _has_completed_checkpoint(existing_records, page_number=page_number, strategy="B"))
    available_c_calls = max_calls - completed_calls - missing_a_calls - missing_b_calls
    if available_c_calls < 0:
        raise RuntimeError("vision_max_calls_too_low_for_ab_strategies")

    planned: dict[int, list[PageRegion]] = {page_number: [] for page_number in page_numbers}
    pending: dict[int, list[PageRegion]] = {}
    for page_number in page_numbers:
        if _has_completed_checkpoint(existing_records, page_number=page_number, strategy="C"):
            continue
        pending[page_number] = sorted(
            list(page_regions.get(page_number, [])),
            key=lambda region: (
                region.segmentation_confidence,
                -region.overlapping_region_count,
                -(region.bounding_box.width * region.bounding_box.height),
            ),
            reverse=True,
        )
    pages_with_regions = [page_number for page_number, regions in pending.items() if regions]
    if available_c_calls < len(pages_with_regions):
        raise RuntimeError("vision_max_calls_too_low_for_c_strategies")

    remaining_calls = available_c_calls
    while remaining_calls > 0 and any(pending.get(page_number) for page_number in page_numbers):
        assigned_this_round = False
        for page_number in page_numbers:
            regions = pending.get(page_number) or []
            if not regions:
                continue
            planned[page_number].append(regions.pop(0))
            remaining_calls -= 1
            assigned_this_round = True
            if remaining_calls == 0:
                break
        if not assigned_this_round:
            break
    return planned


def _build_vision_report(
    *,
    source_url: str,
    catalog_slug: str,
    catalog_title: str,
    viewer_url: str,
    config_url: str,
    total_detected_pages: int,
    selected_assets: list[PageAsset],
    strategy_results: dict[str, list[StrategyPageBenchmarkResult]],
    detected_reports: list[CatalogDiscoveryReport],
    errors: list[str],
    started: float,
    temporary_files_remaining: int,
    report_path: str,
    provider: str,
    model: str,
) -> VisionBenchmarkRunReport:
    strategies = [
        _summarize_strategy_results(strategy_name, strategy_results.get(strategy_name, []))
        for strategy_name in ("A", "B", "C")
    ]
    return VisionBenchmarkRunReport(
        source_url=source_url,
        catalog_slug=catalog_slug,
        catalog_title=catalog_title,
        viewer_url=viewer_url,
        config_url=config_url,
        total_detected_pages=total_detected_pages,
        pages_processed=[page.page_number for page in selected_assets],
        provider=provider,
        model=model,
        strategies=strategies,
        detected_catalogs=detected_reports,
        total_calls=sum(strategy.calls for strategy in strategies),
        total_estimated_cost_eur=_sum_optional(strategy.estimated_cost_eur for strategy in strategies),
        temporary_files_remaining=temporary_files_remaining,
        duration_seconds=round(time.perf_counter() - started, 3),
        report_path=report_path,
        errors=list(errors),
    )


def _summarize_strategy_results(
    strategy_name: str,
    results: list[StrategyPageBenchmarkResult],
) -> StrategyBenchmarkSummary:
    ordered_results = sorted(results, key=lambda item: item.page_number)
    return StrategyBenchmarkSummary(
        strategy=strategy_name,
        calls=sum(item.calls for item in ordered_results),
        duration_seconds=round(sum(item.duration_seconds for item in ordered_results), 3),
        estimated_cost_eur=_sum_optional(item.estimated_cost_eur for item in ordered_results),
        offers_detected=sum(item.offers_detected for item in ordered_results),
        offers_complete=sum(item.offers_complete for item in ordered_results),
        offers_incomplete=sum(item.offers_incomplete for item in ordered_results),
        duplicates=sum(item.duplicates for item in ordered_results),
        errors=sum(len(item.errors) for item in ordered_results),
        page_results=ordered_results,
    )


def _write_progress_reports(
    *,
    settings: Settings,
    checkpoint_store: CheckpointStore,
    source_url: str,
    catalog_slug: str,
    catalog_title: str,
    viewer_url: str,
    config_url: str,
    total_detected_pages: int,
    selected_assets: list[PageAsset],
    strategy_results: dict[str, list[StrategyPageBenchmarkResult]],
    detected_reports: list[CatalogDiscoveryReport],
    errors: list[str],
    started: float,
    report_path: str,
) -> str:
    report = _build_vision_report(
        source_url=source_url,
        catalog_slug=catalog_slug,
        catalog_title=catalog_title,
        viewer_url=viewer_url,
        config_url=config_url,
        total_detected_pages=total_detected_pages,
        selected_assets=selected_assets,
        strategy_results=strategy_results,
        detected_reports=detected_reports,
        errors=errors,
        started=started,
        temporary_files_remaining=_count_temporary_files(settings.temp_dir),
        report_path=report_path,
        provider=settings.vision_provider,
        model=settings.vision_model,
    )
    _write_report_json(settings.vision_report_path, report.to_dict())
    return checkpoint_store.write_report(report.to_dict())


def validate_vision_response_payload(payload: dict[str, object], *, expected_page_number: int) -> list[VisionOffer]:
    if set(payload.keys()) != {"offers"}:
        raise ValueError("vision_payload_unknown_root_fields")
    offers_raw = payload.get("offers")
    if not isinstance(offers_raw, list):
        raise ValueError("vision_payload_offers_must_be_list")
    offers: list[VisionOffer] = []
    for item in offers_raw:
        if not isinstance(item, dict):
            raise ValueError("vision_offer_must_be_object")
        expected_keys = {
            "page_number",
            "bounding_box",
            "product_name",
            "brand",
            "package_format",
            "quantity_value",
            "quantity_unit",
            "promo_price",
            "original_price",
            "unit_price",
            "unit_price_unit",
            "loyalty_amount",
            "loyalty_type",
            "discount_percent",
            "offer_mechanism",
            "conditions",
            "confidence",
            "visual_evidence_notes",
        }
        if set(item.keys()) != expected_keys:
            raise ValueError("vision_offer_unknown_fields")
        box = item["bounding_box"]
        if not isinstance(box, dict) or set(box.keys()) != {"left", "top", "width", "height"}:
            raise ValueError("vision_offer_invalid_bounding_box")
        offer_mechanism = _coerce_optional_string(item["offer_mechanism"])
        if offer_mechanism not in ALLOWED_OFFER_MECHANISMS:
            raise ValueError("vision_offer_invalid_offer_mechanism")
        offer = VisionOffer(
            page_number=_coerce_int(item["page_number"]) or expected_page_number,
            bounding_box=VisionBoundingBox(
                left=_coerce_number(box["left"]) or 0.0,
                top=_coerce_number(box["top"]) or 0.0,
                width=_coerce_number(box["width"]) or 0.0,
                height=_coerce_number(box["height"]) or 0.0,
            ),
            product_name=_coerce_optional_string(item["product_name"]),
            brand=_coerce_optional_string(item["brand"]),
            package_format=_coerce_optional_string(item["package_format"]),
            quantity_value=_coerce_number(item["quantity_value"]),
            quantity_unit=_coerce_optional_string(item["quantity_unit"]),
            promo_price=_coerce_number(item["promo_price"]),
            original_price=_coerce_number(item["original_price"]),
            unit_price=_coerce_number(item["unit_price"]),
            unit_price_unit=_coerce_optional_string(item["unit_price_unit"]),
            loyalty_amount=_coerce_number(item["loyalty_amount"]),
            loyalty_type=_coerce_optional_string(item["loyalty_type"]),
            discount_percent=_coerce_number(item["discount_percent"]),
            offer_mechanism=offer_mechanism,
            conditions=_coerce_optional_string(item["conditions"]),
            confidence=_coerce_number(item["confidence"]),
            visual_evidence_notes=_coerce_optional_string(item["visual_evidence_notes"]),
        )
        if offer.bounding_box.width <= 0 or offer.bounding_box.height <= 0:
            raise ValueError("vision_offer_non_positive_bounding_box")
        if offer.page_number != expected_page_number:
            raise ValueError("vision_offer_unexpected_page_number")
        offers.append(offer)
    return offers


def build_strategy_b_tile_boxes(*, page_width: int, page_height: int, overlap_percent: int) -> list[tuple[int, int, VisionBoundingBox]]:
    tile_width = page_width / 2
    tile_height = page_height / 2
    overlap_x = tile_width * (overlap_percent / 100.0)
    overlap_y = tile_height * (overlap_percent / 100.0)
    boxes: list[tuple[int, int, VisionBoundingBox]] = []
    for row in range(2):
        for col in range(2):
            left = max(0.0, (col * tile_width) - (overlap_x if col > 0 else 0.0))
            top = max(0.0, (row * tile_height) - (overlap_y if row > 0 else 0.0))
            right = min(float(page_width), ((col + 1) * tile_width) + (overlap_x if col < 1 else 0.0))
            bottom = min(float(page_height), ((row + 1) * tile_height) + (overlap_y if row < 1 else 0.0))
            boxes.append((row, col, VisionBoundingBox(left=left, top=top, width=right - left, height=bottom - top)))
    return boxes


def translate_offer_to_page_coordinates(offer: VisionOffer, *, offset_left: float, offset_top: float) -> VisionOffer:
    return offer.translated(offset_left, offset_top)


def dedupe_overlap_offers(offers: list[VisionOffer]) -> tuple[list[VisionOffer], int]:
    deduped: list[VisionOffer] = []
    duplicates = 0
    for offer in offers:
        match_index: int | None = None
        for index, existing in enumerate(deduped):
            if existing.page_number != offer.page_number:
                continue
            if not _offer_signatures_compatible(existing, offer):
                continue
            if existing.bounding_box.overlap_ratio(offer.bounding_box) < 0.35:
                continue
            match_index = index
            break
        if match_index is None:
            deduped.append(offer)
        else:
            duplicates += 1
            if (offer.confidence or 0) > (deduped[match_index].confidence or 0):
                deduped[match_index] = offer
    return deduped, duplicates


def select_strategy_c_regions(regions: list[PageRegion]) -> list[PageRegion]:
    selected: list[PageRegion] = []
    for region in regions:
        if region.price_anchor_count != 1:
            continue
        if region.overlapping_region_count > 0:
            continue
        if region.segmentation_confidence < 55:
            continue
        selected.append(region)
    return selected


def build_strategy_c_crop_box(region: PageRegion, *, page_width: int, page_height: int) -> VisionBoundingBox:
    margin_x = max(24.0, region.bounding_box.width * 0.08)
    margin_y = max(24.0, region.bounding_box.height * 0.08)
    left = max(0.0, region.bounding_box.left - margin_x)
    top = max(0.0, region.bounding_box.top - margin_y)
    right = min(float(page_width), region.bounding_box.right + margin_x)
    bottom = min(float(page_height), region.bounding_box.bottom + margin_y)
    return VisionBoundingBox(left=left, top=top, width=right - left, height=bottom - top)


def is_complete_offer(offer: VisionOffer) -> bool:
    has_price = offer.promo_price is not None or offer.original_price is not None or offer.loyalty_amount is not None
    return bool(offer.product_name and offer.package_format and has_price)


def _run_strategy_for_page(
    *,
    page_number: int,
    strategy: str,
    slices: list[VisionSlice],
    budget: VisionBudgetController,
    vision_client: VisionModelClient,
    page_context: str,
) -> StrategyPageBenchmarkResult:
    all_offers: list[VisionOffer] = []
    errors: list[str] = []
    duration_seconds = 0.0
    estimated_cost_eur = 0.0
    any_cost = False
    total_input_tokens = 0
    total_output_tokens = 0
    any_input_tokens = False
    any_output_tokens = False
    calls = 0

    for index, image_slice in enumerate(slices, start=1):
        try:
            budget.ensure_can_call()
            prompt = build_vision_prompt(page_number=page_number, strategy=strategy, page_context=page_context, slice_index=index)
            response = vision_client.extract_offers(image_path=image_slice.image_path, prompt=prompt)
            budget.register(estimated_cost_eur=response.estimated_cost_eur)
            calls += 1
            duration_seconds += response.duration_seconds
            if response.estimated_cost_eur is not None:
                estimated_cost_eur += response.estimated_cost_eur
                any_cost = True
            if response.input_tokens is not None:
                total_input_tokens += response.input_tokens
                any_input_tokens = True
            if response.output_tokens is not None:
                total_output_tokens += response.output_tokens
                any_output_tokens = True
            offers = validate_vision_response_payload(response.payload, expected_page_number=page_number)
            translated = [
                translate_offer_to_page_coordinates(offer, offset_left=image_slice.origin_left, offset_top=image_slice.origin_top)
                for offer in offers
            ]
            if strategy == "C" and len(translated) > 1:
                errors.append(f"{image_slice.slice_id}:multiple_cards_in_crop")
                continue
            all_offers.extend(translated)
        except Exception as exc:  # pragma: no cover - exercised more in integration use
            errors.append(f"{image_slice.slice_id}:{exc}")

    deduped, duplicates = dedupe_overlap_offers(all_offers)
    offers_complete = len([offer for offer in deduped if is_complete_offer(offer)])
    return StrategyPageBenchmarkResult(
        page_number=page_number,
        strategy=strategy,
        calls=calls,
        duration_seconds=round(duration_seconds, 3),
        estimated_cost_eur=round(estimated_cost_eur, 6) if any_cost else None,
        offers_detected=len(deduped),
        offers_complete=offers_complete,
        offers_incomplete=len(deduped) - offers_complete,
        duplicates=duplicates,
        errors=errors,
        correct_product_price_associations=None,
        false_product_price_associations=None,
        input_tokens=total_input_tokens if any_input_tokens else None,
        output_tokens=total_output_tokens if any_output_tokens else None,
        offers=deduped,
    )


def build_vision_prompt(*, page_number: int, strategy: str, page_context: str, slice_index: int) -> str:
    return "\n".join(
        [
            f"You are extracting promotional product offers from page {page_number} of a French retail catalog.",
            f"Strategy {strategy}. This image is a {page_context} slice #{slice_index}.",
            "Return JSON only and follow the schema exactly.",
            "Detect distinct single-offer cards only.",
            "Do not merge neighboring cards into one offer.",
            "Do not convert Ticket E.Leclerc or loyalty credit into promo_price.",
            "Do not convert remise or discount amount into original_price unless an old price is explicitly shown.",
            "Do not convert unit price such as price per kg into promo_price.",
            "If data is absent, return null.",
            "Bounding boxes must be relative to the provided image only, in pixels.",
        ]
    )


def _discover_catalog_selection(
    settings: Settings,
    fetcher: Fetcher,
    *,
    allowed_hosts: set[str],
) -> tuple[list[CatalogDiscoveryReport], list[CatalogReference]]:
    official_page = fetcher.fetch_text(settings.source_url, allowed_hosts=allowed_hosts, settings=settings)
    catalogs = discover_catalogs(official_page.text, official_page.url, settings.official_domain)
    detected_reports: list[CatalogDiscoveryReport] = []
    selected_catalogs: list[CatalogReference] = []
    for catalog in catalogs:
        selected = catalog.catalog_slug == settings.target_catalog_slug
        ignored_reason = None
        if not selected:
            ignored_reason = "outside_mvp_target"
        elif settings.max_catalogs > 0 and len(selected_catalogs) >= settings.max_catalogs:
            selected = False
            ignored_reason = "max_catalogs_reached"
        detected_reports.append(
            CatalogDiscoveryReport(
                catalog_slug=catalog.catalog_slug,
                title=catalog.title,
                viewer_url=catalog.viewer_url,
                selected=selected,
                ignored_reason=ignored_reason,
            )
        )
        if selected:
            selected_catalogs.append(catalog)
    return detected_reports, selected_catalogs


def _fetch_catalog_assets(
    catalog: CatalogReference,
    settings: Settings,
    fetcher: Fetcher,
    *,
    allowed_hosts: set[str],
) -> tuple[Any, list[PageAsset]]:
    viewer_page = fetcher.fetch_text(catalog.viewer_url, allowed_hosts=allowed_hosts, settings=settings)
    viewer = discover_viewer(viewer_page.text, catalog.viewer_url, allowed_hosts)
    config_js = fetcher.fetch_text(viewer.config_url, allowed_hosts=allowed_hosts, settings=settings)
    page_assets = extract_page_assets(config_js.text, viewer.config_url, allowed_hosts)
    return viewer, page_assets


def _select_page_assets(page_assets: list[PageAsset], settings: Settings) -> list[PageAsset]:
    if settings.selected_page_numbers:
        selected = set(settings.selected_page_numbers)
        return [page for page in page_assets if page.page_number in selected]
    return page_assets[: settings.vision_max_pages]


def _write_temp_page_asset(
    temp_dir: Path,
    page_number: int,
    asset_url: str,
    content_type: str | None,
    content: bytes,
) -> Path:
    suffix = _guess_file_suffix(asset_url, content_type)
    image_path = temp_dir / f"page-{page_number:03d}{suffix}"
    image_path.write_bytes(content)
    return image_path


def _guess_file_suffix(asset_url: str, content_type: str | None) -> str:
    path = urlsplit(asset_url).path.lower()
    if path.endswith(".webp") or (content_type or "").lower().startswith("image/webp"):
        return ".webp"
    if path.endswith(".png"):
        return ".png"
    if path.endswith(".jpg") or path.endswith(".jpeg"):
        return ".jpg"
    return ".img"


def _guess_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _write_report_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _count_temporary_files(temp_dir: Path) -> int:
    if not temp_dir.exists():
        return 0
    return len([item for item in temp_dir.rglob("*") if item.is_file()])


def _cleanup_temp_dir(temp_dir: Path) -> None:
    if not temp_dir.exists():
        return
    for child in sorted(temp_dir.rglob("*"), reverse=True):
        if child.is_file():
            child.unlink()
        elif child.is_dir():
            child.rmdir()
    temp_dir.rmdir()


def _offer_signatures_compatible(left: VisionOffer, right: VisionOffer) -> bool:
    left_price_signature = (
        _round_signature(left.promo_price),
        _round_signature(left.original_price),
        _round_signature(left.loyalty_amount),
        left.package_format or "",
        left.offer_mechanism,
    )
    right_price_signature = (
        _round_signature(right.promo_price),
        _round_signature(right.original_price),
        _round_signature(right.loyalty_amount),
        right.package_format or "",
        right.offer_mechanism,
    )
    return left_price_signature == right_price_signature


def _round_signature(value: float | None) -> float | None:
    return round(value, 2) if value is not None else None


def _strategy_page_result_from_dict(payload: dict[str, object]) -> StrategyPageBenchmarkResult:
    offers = [
        _vision_offer_from_dict(item)
        for item in payload.get("offers", [])
        if isinstance(item, dict)
    ]
    return StrategyPageBenchmarkResult(
        page_number=_coerce_int(payload.get("page_number")) or 0,
        strategy=_coerce_optional_string(payload.get("strategy")) or "",
        calls=_coerce_int(payload.get("calls")) or 0,
        duration_seconds=_coerce_number(payload.get("duration_seconds")) or 0.0,
        estimated_cost_eur=_coerce_number(payload.get("estimated_cost_eur")),
        offers_detected=_coerce_int(payload.get("offers_detected")) or len(offers),
        offers_complete=_coerce_int(payload.get("offers_complete")) or 0,
        offers_incomplete=_coerce_int(payload.get("offers_incomplete")) or 0,
        duplicates=_coerce_int(payload.get("duplicates")) or 0,
        errors=[str(item) for item in payload.get("errors", [])] if isinstance(payload.get("errors"), list) else [],
        correct_product_price_associations=_coerce_int(payload.get("correct_product_price_associations")),
        false_product_price_associations=_coerce_int(payload.get("false_product_price_associations")),
        input_tokens=_coerce_int(payload.get("input_tokens")),
        output_tokens=_coerce_int(payload.get("output_tokens")),
        offers=offers,
    )


def _vision_offer_from_dict(payload: dict[str, object]) -> VisionOffer:
    box = payload.get("bounding_box")
    if not isinstance(box, dict):
        raise ValueError("vision_offer_missing_bounding_box")
    return VisionOffer(
        page_number=_coerce_int(payload.get("page_number")) or 0,
        bounding_box=VisionBoundingBox(
            left=_coerce_number(box.get("left")) or 0.0,
            top=_coerce_number(box.get("top")) or 0.0,
            width=_coerce_number(box.get("width")) or 0.0,
            height=_coerce_number(box.get("height")) or 0.0,
        ),
        product_name=_coerce_optional_string(payload.get("product_name")),
        brand=_coerce_optional_string(payload.get("brand")),
        package_format=_coerce_optional_string(payload.get("package_format")),
        quantity_value=_coerce_number(payload.get("quantity_value")),
        quantity_unit=_coerce_optional_string(payload.get("quantity_unit")),
        promo_price=_coerce_number(payload.get("promo_price")),
        original_price=_coerce_number(payload.get("original_price")),
        unit_price=_coerce_number(payload.get("unit_price")),
        unit_price_unit=_coerce_optional_string(payload.get("unit_price_unit")),
        loyalty_amount=_coerce_number(payload.get("loyalty_amount")),
        loyalty_type=_coerce_optional_string(payload.get("loyalty_type")),
        discount_percent=_coerce_number(payload.get("discount_percent")),
        offer_mechanism=_coerce_optional_string(payload.get("offer_mechanism")) or "unknown",
        conditions=_coerce_optional_string(payload.get("conditions")),
        confidence=_coerce_number(payload.get("confidence")),
        visual_evidence_notes=_coerce_optional_string(payload.get("visual_evidence_notes")),
    )


def _coerce_optional_string(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("vision_value_expected_string")
    return value


def _coerce_number(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("vision_value_expected_number")
    return float(value)


def _coerce_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("vision_value_expected_int")
    return int(value)


def _sum_optional(values) -> float | None:
    total = 0.0
    has_value = False
    for value in values:
        if value is not None:
            total += value
            has_value = True
    return round(total, 6) if has_value else None


def _load_env_value(name: str) -> str | None:
    import os

    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return None
    return raw


def _load_gcp_access_token() -> str:
    token = _load_env_value("GOOGLE_OAUTH_ACCESS_TOKEN")
    if token:
        return token
    request = urllib.request.Request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise RuntimeError("gcp_metadata_token_missing")
    return access_token


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _estimate_openai_cost(
    *,
    input_tokens: int | None,
    output_tokens: int | None,
    input_price_eur_per_1m_tokens: float | None,
    output_price_eur_per_1m_tokens: float | None,
) -> float | None:
    if input_tokens is None or output_tokens is None:
        return None
    if input_price_eur_per_1m_tokens is None or output_price_eur_per_1m_tokens is None:
        return None
    total = (
        (input_tokens / 1_000_000) * input_price_eur_per_1m_tokens
        + (output_tokens / 1_000_000) * output_price_eur_per_1m_tokens
    )
    return round(total, 6)


def _extract_openai_output_text(payload: dict[str, object]) -> str:
    collected: list[str] = []
    for item in payload.get("output", []) if isinstance(payload.get("output"), list) else []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str):
                collected.append(text)
    return "\n".join(part.strip() for part in collected if part.strip())


def _vision_response_schema() -> dict[str, object]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["offers"],
        "properties": {
            "offers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "page_number",
                        "bounding_box",
                        "product_name",
                        "brand",
                        "package_format",
                        "quantity_value",
                        "quantity_unit",
                        "promo_price",
                        "original_price",
                        "unit_price",
                        "unit_price_unit",
                        "loyalty_amount",
                        "loyalty_type",
                        "discount_percent",
                        "offer_mechanism",
                        "conditions",
                        "confidence",
                        "visual_evidence_notes",
                    ],
                    "properties": {
                        "page_number": {"type": "integer"},
                        "bounding_box": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["left", "top", "width", "height"],
                            "properties": {
                                "left": {"type": "number"},
                                "top": {"type": "number"},
                                "width": {"type": "number"},
                                "height": {"type": "number"},
                            },
                        },
                        "product_name": {"type": ["string", "null"]},
                        "brand": {"type": ["string", "null"]},
                        "package_format": {"type": ["string", "null"]},
                        "quantity_value": {"type": ["number", "null"]},
                        "quantity_unit": {"type": ["string", "null"]},
                        "promo_price": {"type": ["number", "null"]},
                        "original_price": {"type": ["number", "null"]},
                        "unit_price": {"type": ["number", "null"]},
                        "unit_price_unit": {"type": ["string", "null"]},
                        "loyalty_amount": {"type": ["number", "null"]},
                        "loyalty_type": {"type": ["string", "null"]},
                        "discount_percent": {"type": ["number", "null"]},
                        "offer_mechanism": {"type": "string", "enum": list(ALLOWED_OFFER_MECHANISMS)},
                        "conditions": {"type": ["string", "null"]},
                        "confidence": {"type": ["number", "null"]},
                        "visual_evidence_notes": {"type": ["string", "null"]},
                    },
                },
            }
        },
    }
