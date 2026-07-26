from __future__ import annotations

import concurrent.futures
import copy
import json
import logging
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import BinaryIO, Protocol

from PIL import Image, UnidentifiedImageError

from .api.errors import ScannerApiError
from .api.settings import ScannerSettings
from .column_detector import ColumnDetector
from .geometry_types import OCRDocument, OCRToken
from .image_preprocessor import PreprocessResult, ImagePreprocessor
from .line_reconstructor import LineReconstructor, ReconstructedLine
from .long_receipt_pipeline import run_two_photo_pipeline
from .market_resolver import MarketProductResolver, build_market_product_resolver
from .quality_gate import QualityDecision, ReceiptQualityGate
from .quota import QuotaReservation, ScanQuotaProvider, build_quota_provider
from .receipt_parser_fr import ParsedReceipt, ParsedReceiptItem, ReceiptParserFR
from .v2.activation import build_v2_safe_candidate
from .v2.shadow_parser import GenericReceiptParserV2


logger = logging.getLogger("receipt_scanner.api")

SUPPORTED_IMAGE_MIME = {
    "image/jpeg": {"JPEG"},
    "image/png": {"PNG"},
    "image/webp": {"WEBP"},
}


@dataclass(slots=True)
class ScanUpload:
    filename: str | None
    content_type: str | None
    stream: BinaryIO


@dataclass(slots=True)
class ValidatedImage:
    path: Path
    size_bytes: int
    mime_type: str
    width: int
    height: int


@dataclass(slots=True)
class PipelineResult:
    receipt: ParsedReceipt
    quality: dict[str, object]
    engine: str
    elapsed_seconds: float
    token_count: int
    rotation_degrees: int | None
    overlap: dict[str, object] | None = None
    parser_mode_requested: str = "legacy"
    parser_mode_used: str = "legacy"
    v2_fallback_reasons: list[str] = field(default_factory=list)
    v2_diagnostics: dict[str, object] | None = None


@dataclass(slots=True)
class _InFlightScan:
    event: threading.Event
    response: dict[str, object] | None = None
    error: BaseException | None = None
    created_at: float = 0.0


class PipelineRunner(Protocol):
    def run_single(self, image_path: Path, work_dir: Path) -> PipelineResult:
        ...

    def run_long_receipt(
        self,
        top_image_path: Path,
        bottom_image_path: Path,
        work_dir: Path,
    ) -> PipelineResult:
        ...


class RapidOCREngineProvider:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._engine = None

    @property
    def model_loaded(self) -> bool:
        return self._engine is not None

    def get(self):
        if self._engine is None:
            with self._lock:
                if self._engine is None:
                    from .ocr_engine import RapidOCREngine

                    self._engine = RapidOCREngine(use_cls=False)
        return self._engine


class DefaultPipelineRunner:
    def __init__(
        self,
        *,
        engine_provider: RapidOCREngineProvider | None = None,
        parser_mode: str = "shadow",
    ) -> None:
        normalized_mode = parser_mode.strip().lower()
        if normalized_mode not in {"legacy", "shadow", "v2_safe"}:
            raise ValueError(
                "parser_mode must be legacy, shadow or v2_safe"
            )
        self.engine_provider = engine_provider or RapidOCREngineProvider()
        self.parser_mode = normalized_mode

    @property
    def model_loaded(self) -> bool:
        return self.engine_provider.model_loaded

    def run_single(self, image_path: Path, work_dir: Path) -> PipelineResult:
        started = time.monotonic()
        preprocessed = work_dir / "preprocessed.jpg"
        preprocessing = ImagePreprocessor(max_side=1600).process(
            image_path,
            preprocessed,
        )
        engine = self.engine_provider.get()
        document: OCRDocument = engine.analyze(preprocessed)
        lines = LineReconstructor().reconstruct(document)
        if document.tokens:
            ColumnDetector().assign_columns(document, lines)
        legacy_receipt = ReceiptParserFR().parse(document, lines)
        legacy_quality = ReceiptQualityGate().evaluate(
            preprocessed,
            document,
            legacy_receipt,
        ).to_dict()
        receipt, quality, used_mode, fallback_reasons, v2_diagnostics = (
            self._apply_parser_mode(
                image_path=preprocessed,
                document=document,
                lines=lines,
                legacy_receipt=legacy_receipt,
                legacy_quality=legacy_quality,
            )
        )
        elapsed = max(document.elapsed_seconds, time.monotonic() - started)

        return PipelineResult(
            receipt=receipt,
            quality=quality,
            engine=document.engine,
            elapsed_seconds=elapsed,
            token_count=len(document.tokens),
            rotation_degrees=preprocessing.rotation_degrees,
            overlap=None,
            parser_mode_requested=self.parser_mode,
            parser_mode_used=used_mode,
            v2_fallback_reasons=fallback_reasons,
            v2_diagnostics=v2_diagnostics,
        )

    def run_long_receipt(
        self,
        top_image_path: Path,
        bottom_image_path: Path,
        work_dir: Path,
    ) -> PipelineResult:
        started = time.monotonic()
        summary = run_two_photo_pipeline(
            top_image_path,
            bottom_image_path,
            output_root=work_dir,
            run_id="long-receipt",
            ocr_engine=self.engine_provider.get(),
        )
        files = summary["files"]
        legacy_receipt = _parsed_receipt_from_dict(
            json.loads(Path(files["parsed_receipt"]).read_text(encoding="utf-8"))
        )
        legacy_quality = json.loads(
            Path(files["quality_decision"]).read_text(encoding="utf-8")
        )
        document = OCRDocument.load_json(files["columnized_ocr"])
        lines = _load_reconstructed_lines(files["reconstructed_lines"])
        receipt, quality, used_mode, fallback_reasons, v2_diagnostics = (
            self._apply_parser_mode(
                image_path=Path(files["merged_preprocessed"]),
                document=document,
                lines=lines,
                legacy_receipt=legacy_receipt,
                legacy_quality=legacy_quality,
            )
        )
        overlap = summary.get("overlap")
        preprocessing = summary.get("preprocessing", {})
        top_rotation = preprocessing.get("top", {}).get("rotation_degrees")
        bottom_rotation = preprocessing.get("bottom", {}).get("rotation_degrees")

        return PipelineResult(
            receipt=receipt,
            quality=quality,
            engine="rapidocr-onnxruntime",
            elapsed_seconds=float(
                summary.get("ocr", {}).get(
                    "elapsed_seconds_total",
                    time.monotonic() - started,
                )
            ),
            token_count=int(summary.get("ocr", {}).get("merged_token_count", 0)),
            rotation_degrees=max(
                int(top_rotation or 0),
                int(bottom_rotation or 0),
            ),
            overlap=overlap if isinstance(overlap, dict) else None,
            parser_mode_requested=self.parser_mode,
            parser_mode_used=used_mode,
            v2_fallback_reasons=fallback_reasons,
            v2_diagnostics=v2_diagnostics,
        )

    def _apply_parser_mode(
        self,
        *,
        image_path: Path,
        document: OCRDocument,
        lines: list[ReconstructedLine],
        legacy_receipt: ParsedReceipt,
        legacy_quality: dict[str, object],
    ) -> tuple[
        ParsedReceipt,
        dict[str, object],
        str,
        list[str],
        dict[str, object] | None,
    ]:
        if self.parser_mode == "legacy":
            return legacy_receipt, legacy_quality, "legacy", [], None

        try:
            v2_result = GenericReceiptParserV2().analyze(
                document,
                lines,
                legacy_receipt=legacy_receipt,
            )
        except Exception as exc:
            logger.warning(
                "v2_parser_failed",
                extra={"error_type": type(exc).__name__},
            )
            return (
                legacy_receipt,
                legacy_quality,
                "legacy",
                ["v2_parser_exception"],
                None,
            )

        selected = v2_result.get("selected_hypothesis") or {}
        comparison = v2_result.get("comparison") or {}
        v2_diagnostics: dict[str, object] = {
            "v2_total": (selected.get("target_total") or {}).get("amount"),
            "v2_items_total": selected.get("items_total"),
            "v2_product_line_count": len(selected.get("items") or []),
            "v2_counted_quantity": selected.get("counted_quantity"),
            "v2_reasons": list(selected.get("reasons") or []),
            "comparison": comparison,
        }

        if self.parser_mode == "shadow":
            return legacy_receipt, legacy_quality, "legacy", [], v2_diagnostics

        candidate = build_v2_safe_candidate(
            legacy_receipt=legacy_receipt,
            v2_result=v2_result,
        )
        v2_diagnostics.update(candidate.diagnostics)
        if not candidate.accepted or candidate.receipt is None:
            return (
                legacy_receipt,
                legacy_quality,
                "legacy",
                list(candidate.fallback_reasons),
                v2_diagnostics,
            )

        candidate_quality = ReceiptQualityGate().evaluate(
            image_path,
            document,
            candidate.receipt,
        ).to_dict()
        if not bool(candidate_quality.get("should_record_budget")):
            return (
                legacy_receipt,
                legacy_quality,
                "legacy",
                ["v2_quality_did_not_authorize_budget"],
                v2_diagnostics,
            )

        return (
            candidate.receipt,
            candidate_quality,
            "v2_safe",
            [],
            v2_diagnostics,
        )


class ReceiptScanService:
    def __init__(
        self,
        *,
        settings: ScannerSettings,
        runner: PipelineRunner | None = None,
        quota_provider: ScanQuotaProvider | None = None,
        market_resolver: MarketProductResolver | None = None,
    ) -> None:
        self.settings = settings
        self.runner = runner or DefaultPipelineRunner(
            parser_mode=settings.parser_mode
        )
        self.quota_provider = quota_provider or build_quota_provider(settings)
        self.market_resolver = (
            market_resolver or build_market_product_resolver(settings)
        )
        self._semaphore = threading.BoundedSemaphore(
            value=settings.max_concurrent_scans
        )
        self._idempotency_lock = threading.Lock()
        self._inflight_scans: dict[tuple[str, str, str], _InFlightScan] = {}
        self._completed_scans: dict[tuple[str, str, str], tuple[float, dict[str, object]]] = {}

    @property
    def model_loaded(self) -> bool:
        return bool(getattr(self.runner, "model_loaded", False))

    def scan_single(
        self,
        *,
        upload: ScanUpload,
        user_id: str,
        access_token: str | None = None,
        scan_id: str | None = None,
        locale: str | None = None,
        client_version: str | None = None,
    ) -> dict[str, object]:
        del locale, client_version
        resolved_scan_id = scan_id or str(uuid.uuid4())
        return self._run_idempotent(
            user_id=user_id,
            mode="single",
            scan_id=resolved_scan_id,
            producer=lambda: self._with_capacity(
                scan_id=resolved_scan_id,
                mode="single",
                operation=lambda work_dir: self._scan_single_in_temp(
                    upload,
                    work_dir,
                    resolved_scan_id,
                    user_id,
                    access_token,
                ),
            ),
        )

    def scan_long_receipt(
        self,
        *,
        top_upload: ScanUpload,
        bottom_upload: ScanUpload,
        user_id: str,
        access_token: str | None = None,
        scan_id: str | None = None,
        locale: str | None = None,
        client_version: str | None = None,
    ) -> dict[str, object]:
        del locale, client_version
        resolved_scan_id = scan_id or str(uuid.uuid4())
        return self._run_idempotent(
            user_id=user_id,
            mode="long_receipt",
            scan_id=resolved_scan_id,
            producer=lambda: self._with_capacity(
                scan_id=resolved_scan_id,
                mode="long_receipt",
                operation=lambda work_dir: self._scan_long_in_temp(
                    top_upload,
                    bottom_upload,
                    work_dir,
                    resolved_scan_id,
                    user_id,
                    access_token,
                ),
            ),
        )

    def _reserve_quota(
        self,
        *,
        user_id: str,
        mode: str,
        scan_id: str,
        access_token: str | None,
    ) -> QuotaReservation:
        return self.quota_provider.reserve_scan(
            user_id=user_id,
            mode=mode,
            request_id=scan_id,
            access_token=access_token,
        )

    def _with_capacity(
        self,
        *,
        scan_id: str,
        mode: str,
        operation,
    ) -> dict[str, object]:
        acquired = self._semaphore.acquire(
            timeout=self.settings.scanner_busy_timeout_seconds
        )
        if not acquired:
            raise ScannerApiError(
                code="scanner_busy",
                retryable=True,
                scan_id=scan_id,
            )

        started = time.monotonic()
        try:
            with tempfile.TemporaryDirectory(
                prefix="bkp-receipt-scan-",
                dir=self.settings.temp_parent_dir,
                ignore_cleanup_errors=True,
            ) as temp_dir:
                response = operation(Path(temp_dir))
                self._log_success(scan_id, mode, response, started)
                return response
        except ScannerApiError:
            raise
        except RuntimeError as exc:
            raise self._map_runtime_error(exc, scan_id) from exc
        except Exception as exc:
            raise ScannerApiError(
                code="internal_scan_error",
                retryable=True,
                scan_id=scan_id,
            ) from exc
        finally:
            self._semaphore.release()

    def _run_idempotent(
        self,
        *,
        user_id: str,
        mode: str,
        scan_id: str,
        producer,
    ) -> dict[str, object]:
        key = (user_id, mode, scan_id)
        now = time.monotonic()
        self._purge_idempotency_cache(now)
        owner = False

        with self._idempotency_lock:
            completed = self._completed_scans.get(key)
            if completed is not None:
                return copy.deepcopy(completed[1])

            inflight = self._inflight_scans.get(key)
            if inflight is None:
                inflight = _InFlightScan(event=threading.Event(), created_at=now)
                self._inflight_scans[key] = inflight
                owner = True

        if not owner:
            inflight.event.wait(timeout=self.settings.processing_timeout_seconds + 5)
            if inflight.response is not None:
                return copy.deepcopy(inflight.response)
            if inflight.error is not None:
                raise inflight.error
            raise ScannerApiError(
                code="processing_timeout",
                retryable=True,
                scan_id=scan_id,
            )

        try:
            response = producer()
            inflight.response = copy.deepcopy(response)
            with self._idempotency_lock:
                self._completed_scans[key] = (time.monotonic(), copy.deepcopy(response))
            return response
        except BaseException as exc:
            inflight.error = exc
            raise
        finally:
            with self._idempotency_lock:
                self._inflight_scans.pop(key, None)
            inflight.event.set()

    def _purge_idempotency_cache(self, now: float) -> None:
        ttl = self.settings.idempotency_cache_ttl_seconds
        if ttl <= 0:
            return
        with self._idempotency_lock:
            stale_keys = [
                key for key, (created_at, _response) in self._completed_scans.items()
                if now - created_at > ttl
            ]
            for key in stale_keys:
                self._completed_scans.pop(key, None)

    def _scan_single_in_temp(
        self,
        upload: ScanUpload,
        work_dir: Path,
        scan_id: str,
        user_id: str,
        access_token: str | None,
    ) -> dict[str, object]:
        image = self._persist_and_validate_upload(
            upload,
            work_dir / "single_input.bin",
            scan_id=scan_id,
        )
        return self._run_reserved_pipeline(
            user_id=user_id,
            mode="single",
            scan_id=scan_id,
            access_token=access_token,
            operation=lambda: self.runner.run_single(image.path, work_dir),
        )

    def _scan_long_in_temp(
        self,
        top_upload: ScanUpload,
        bottom_upload: ScanUpload,
        work_dir: Path,
        scan_id: str,
        user_id: str,
        access_token: str | None,
    ) -> dict[str, object]:
        top = self._persist_and_validate_upload(
            top_upload,
            work_dir / "top_input.bin",
            scan_id=scan_id,
        )
        bottom = self._persist_and_validate_upload(
            bottom_upload,
            work_dir / "bottom_input.bin",
            scan_id=scan_id,
        )
        if top.size_bytes + bottom.size_bytes > self.settings.max_total_file_size_bytes:
            raise ScannerApiError(
                code="file_too_large",
                retryable=True,
                scan_id=scan_id,
            )
        return self._run_reserved_pipeline(
            user_id=user_id,
            mode="long_receipt",
            scan_id=scan_id,
            access_token=access_token,
            operation=lambda: self.runner.run_long_receipt(
                top.path,
                bottom.path,
                work_dir,
            ),
        )

    def _run_reserved_pipeline(
        self,
        *,
        user_id: str,
        mode: str,
        scan_id: str,
        access_token: str | None,
        operation,
    ) -> dict[str, object]:
        reservation = self._reserve_quota(
            user_id=user_id,
            mode=mode,
            scan_id=scan_id,
            access_token=access_token,
        )
        try:
            executor: concurrent.futures.ThreadPoolExecutor | None = (
                concurrent.futures.ThreadPoolExecutor(max_workers=1)
            )
            try:
                future = executor.submit(operation)
                result = future.result(
                    timeout=self.settings.processing_timeout_seconds
                )
            except concurrent.futures.TimeoutError as exc:
                future.cancel()
                executor.shutdown(wait=False, cancel_futures=True)
                executor = None
                raise ScannerApiError(
                    code="processing_timeout",
                    retryable=True,
                    scan_id=scan_id,
                ) from exc
            finally:
                if executor is not None:
                    executor.shutdown(wait=True, cancel_futures=True)
            self.market_resolver.enrich(
                result.receipt,
                access_token=access_token,
            )
            response = self._to_api_response(
                scan_id=scan_id,
                mode=mode,
                result=result,
            )
            self.quota_provider.complete_scan(
                reservation=reservation,
                access_token=access_token,
            )
            return response
        except ScannerApiError as exc:
            if exc.code in {"internal_scan_error", "processing_timeout"}:
                self._release_reserved_quota(
                    reservation,
                    access_token,
                    reason=exc.code,
                )
            raise
        except Exception:
            self._release_reserved_quota(
                reservation,
                access_token,
                reason="internal_scan_error",
            )
            raise

    def _release_reserved_quota(
        self,
        reservation: QuotaReservation,
        access_token: str | None,
        *,
        reason: str,
    ) -> None:
        try:
            self.quota_provider.release_scan(
                reservation=reservation,
                access_token=access_token,
                reason=reason,
            )
        except ScannerApiError:
            logger.warning(
                "quota_release_failed",
                extra={"scan_id": reservation.request_id, "reason": reason},
            )

    def _persist_and_validate_upload(
        self,
        upload: ScanUpload,
        destination: Path,
        *,
        scan_id: str,
    ) -> ValidatedImage:
        content_type = (upload.content_type or "").split(";")[0].strip().lower()
        if content_type not in SUPPORTED_IMAGE_MIME:
            raise ScannerApiError(
                code="invalid_file_type",
                retryable=True,
                scan_id=scan_id,
            )

        total = 0
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as output:
            while True:
                chunk = upload.stream.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > self.settings.max_file_size_bytes:
                    raise ScannerApiError(
                        code="file_too_large",
                        retryable=True,
                        scan_id=scan_id,
                    )
                output.write(chunk)

        if total <= 0:
            raise ScannerApiError(
                code="invalid_image",
                retryable=True,
                scan_id=scan_id,
            )

        try:
            with Image.open(destination) as opened:
                opened.verify()
            with Image.open(destination) as opened:
                image_format = opened.format
                width, height = opened.size
        except (UnidentifiedImageError, OSError) as exc:
            raise ScannerApiError(
                code="invalid_image",
                retryable=True,
                scan_id=scan_id,
            ) from exc

        if image_format not in SUPPORTED_IMAGE_MIME[content_type]:
            raise ScannerApiError(
                code="invalid_file_type",
                retryable=True,
                scan_id=scan_id,
            )
        if (
            width < self.settings.min_image_width
            or height < self.settings.min_image_height
            or width * height > self.settings.max_image_pixels
        ):
            raise ScannerApiError(
                code="image_dimensions_invalid",
                retryable=True,
                scan_id=scan_id,
            )

        return ValidatedImage(
            path=destination,
            size_bytes=total,
            mime_type=content_type,
            width=width,
            height=height,
        )

    @staticmethod
    def _map_runtime_error(exc: RuntimeError, scan_id: str) -> ScannerApiError:
        message = str(exc)
        lowered = message.lower()
        if "chevauchement" in lowered or "raccord" in lowered:
            code = "overlap_not_found"
        elif "inverse" in lowered or "commence trop bas" in lowered:
            code = "images_order_invalid"
        else:
            code = "internal_scan_error"
        return ScannerApiError(code=code, retryable=True, scan_id=scan_id)

    def _to_api_response(
        self,
        *,
        scan_id: str,
        mode: str,
        result: PipelineResult,
    ) -> dict[str, object]:
        quality = result.quality
        receipt = result.receipt
        diagnostics = None
        if self.settings.diagnostics_enabled:
            overlap = result.overlap or {}
            diagnostics = {
                "engine": result.engine,
                "elapsed_seconds": _round_float(result.elapsed_seconds, "0.001"),
                "token_count": result.token_count,
                "rotation_degrees": result.rotation_degrees,
                "overlap": {
                    "used": mode == "long_receipt",
                    "matched_anchor_count": overlap.get("matched_anchor_count"),
                    "average_similarity": _round_optional(
                        overlap.get("average_similarity"),
                        "0.0001",
                    ),
                },
                "parser": {
                    "requested_mode": result.parser_mode_requested,
                    "used_mode": result.parser_mode_used,
                    "production_output_changed": (
                        result.parser_mode_used == "v2_safe"
                    ),
                    "fallback_reasons": list(result.v2_fallback_reasons),
                    **(result.v2_diagnostics or {}),
                },
            }

        status = str(quality["status"])
        should_feed_courses = bool(quality["should_feed_courses"])
        should_feed_market = bool(quality["should_feed_market_database"])

        return {
            "scan_id": scan_id,
            "mode": mode,
            "status": status,
            "exploitable": bool(quality["exploitable"]),
            "should_record_budget": bool(quality["should_record_budget"]),
            "budget_amount": _money(quality.get("budget_amount")),
            "article_data_mode": quality["article_data_mode"],
            "should_feed_courses": should_feed_courses,
            "should_feed_market_database": should_feed_market,
            "should_feed_verified_articles": bool(
                quality["should_feed_verified_articles"]
            ),
            "requires_user_validation": bool(quality["requires_user_validation"]),
            "unattributed_amount": _money(quality.get("unattributed_amount")),
            "receipt": {
                "store_name": receipt.store_name,
                "store_location": receipt.store_location,
                "receipt_date": receipt.receipt_date,
                "receipt_time": receipt.receipt_time,
                "declared_item_count": receipt.declared_item_count,
                "counted_quantity": _round_float(receipt.counted_quantity, "0.001"),
                "product_line_count": len(receipt.items),
                "items_total": _money(receipt.items_total),
                "total": _money(receipt.total),
                "article_total": _money(receipt.article_total),
                "immediate_discount_total": _money(
                    receipt.immediate_discount_total
                ),
                "payable_total": _money(receipt.payable_total),
            },
            "items": [
                _item_to_api(
                    item,
                    eligible_courses=should_feed_courses and not item.needs_review,
                    eligible_market=should_feed_market and not item.needs_review,
                )
                for item in receipt.items
            ],
            "warnings": list(receipt.warnings),
            "reasons": list(quality["reasons"]),
            "diagnostics": diagnostics,
        }

    @staticmethod
    def _log_success(
        scan_id: str,
        mode: str,
        response: dict[str, object],
        started: float,
    ) -> None:
        receipt = response.get("receipt") if isinstance(response, dict) else {}
        diagnostics = response.get("diagnostics") if isinstance(response, dict) else {}
        logger.info(
            "scan_completed",
            extra={
                "scan_id": scan_id,
                "mode": mode,
                "status": response.get("status"),
                "duration_seconds": round(time.monotonic() - started, 3),
                "token_count": (
                    diagnostics.get("token_count")
                    if isinstance(diagnostics, dict)
                    else None
                ),
                "product_line_count": (
                    receipt.get("product_line_count")
                    if isinstance(receipt, dict)
                    else None
                ),
                "should_record_budget": response.get("should_record_budget"),
                "parser_mode_requested": (
                    diagnostics.get("parser", {}).get("requested_mode")
                    if isinstance(diagnostics, dict)
                    and isinstance(diagnostics.get("parser"), dict)
                    else None
                ),
                "parser_mode_used": (
                    diagnostics.get("parser", {}).get("used_mode")
                    if isinstance(diagnostics, dict)
                    and isinstance(diagnostics.get("parser"), dict)
                    else None
                ),
            },
        )


def _money(value: object) -> float | None:
    if value is None:
        return None
    return float(
        Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    )


def _round_optional(value: object, scale: str) -> float | None:
    if value is None:
        return None
    return _round_float(value, scale)


def _round_float(value: object, scale: str) -> float:
    return float(
        Decimal(str(value)).quantize(Decimal(scale), rounding=ROUND_HALF_UP)
    )


def _item_to_api(
    item: ParsedReceiptItem,
    *,
    eligible_courses: bool,
    eligible_market: bool,
) -> dict[str, object]:
    return {
        "raw_name": item.raw_name,
        "canonical_name": item.canonical_name,
        "quantity": _round_float(item.quantity, "0.001"),
        "unit_price": _money(item.unit_price),
        "total_price": _money(item.total_price),
        "weight_kg": _round_optional(item.weight_kg, "0.001"),
        "price_per_kg": _money(item.price_per_kg),
        "vat_code": item.vat_code,
        "item_type": item.item_type,
        "ocr_confidence": _round_float(item.ocr_confidence, "0.0001"),
        "needs_review": item.needs_review,
        "eligible_for_courses": eligible_courses,
        "eligible_for_market_database": eligible_market,
    }


def _load_reconstructed_lines(path: str | Path) -> list[ReconstructedLine]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    lines: list[ReconstructedLine] = []
    for row in payload.get("lines", []):
        tokens = [OCRToken.from_dict(item) for item in row.get("tokens", [])]
        lines.append(
            ReconstructedLine(
                line_id=int(row["line_id"]),
                tokens=tokens,
                center_y=float(row["center_y"]),
                y_min=float(row["y_min"]),
                y_max=float(row["y_max"]),
            )
        )
    return lines


def _parsed_receipt_from_dict(data: dict[str, object]) -> ParsedReceipt:
    items = [
        ParsedReceiptItem(
            raw_name=str(item["raw_name"]),
            quantity=float(item.get("quantity", 1.0)),
            unit_price=(
                float(item["unit_price"])
                if item.get("unit_price") is not None
                else None
            ),
            total_price=float(item["total_price"]),
            vat_code=(
                int(item["vat_code"]) if item.get("vat_code") is not None else None
            ),
            item_type=str(item.get("item_type", "standard")),
            raw_detail=item.get("raw_detail"),
            weight_kg=(
                float(item["weight_kg"]) if item.get("weight_kg") is not None else None
            ),
            price_per_kg=(
                float(item["price_per_kg"])
                if item.get("price_per_kg") is not None
                else None
            ),
            ocr_confidence=float(item.get("ocr_confidence", 0.0)),
            source_line_ids=[
                int(value) for value in item.get("source_line_ids", [])
            ],
            needs_review=bool(item.get("needs_review", False)),
            canonical_name=item.get("canonical_name"),
            match_type=item.get("match_type"),
            match_confidence=(
                float(item["match_confidence"])
                if item.get("match_confidence") is not None
                else None
            ),
        )
        for item in data.get("items", [])
    ]
    return ParsedReceipt(
        store_name=data.get("store_name"),
        store_location=data.get("store_location"),
        receipt_date=data.get("receipt_date"),
        receipt_time=data.get("receipt_time"),
        declared_item_count=data.get("declared_item_count"),
        total=data.get("total"),
        items=items,
        excluded_sections=list(data.get("excluded_sections", [])),
        warnings=list(data.get("warnings", [])),
        article_total=data.get("article_total"),
        immediate_discount_total=data.get("immediate_discount_total"),
        payable_total=data.get("payable_total"),
    )