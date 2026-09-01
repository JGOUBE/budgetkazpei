from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit

from app.collectors.eleclerc_reunion import CatalogReference, discover_catalogs
from app.collectors.carrefour_reunion import run_carrefour_reunion_readonly
from app.collectors.leader_price_reunion import LeaderPriceReadonlyRunReport, run_leader_price_readonly
from app.db.repositories import InMemoryPageSnapshotRepository, PageSnapshotRepository, build_repository
from app.extractors.catalog_page_regions import PageRegion, detect_regions
from app.extractors.catalog_product_ocr import CatalogProductOcr, OcrPage, RapidOcrCliClient
from app.extractors.fliphtml5_pages import discover_viewer, extract_page_assets
from app.models.promotion_candidate import PromotionCandidate
from app.services.hashing import hash_chunks
from app.services.page_fingerprint import PageAssetMetadata, plan_page_snapshot
from app.services.page_layout_classifier import PageLayoutAnalysis, classify_page_layout, select_representative_pages
from app.services.promotion_deduplication import DeduplicationSummary, annotate_duplicates
from app.services.promotion_scoring import extract_promotion_candidates
from app.services.leader_price_importer import LeaderPriceImportSummary, import_leader_price_report
from app.services.leader_price_incremental import (
    LeaderPriceIncrementalReport,
    run_leader_price_incremental,
)
from app.services.leader_price_validation_job import (
    LeaderPriceValidationJobReport,
    build_validation_job_smoke_report,
    run_leader_price_validation_job,
)
from app.services.carrefour_reunion_incremental import run_carrefour_reunion_incremental
from app.services.vision_benchmark import VisionBenchmarkRunReport, run_vision_benchmark
from app.settings import Settings


@dataclass(frozen=True)
class TextDocument:
    url: str
    content_type: str | None
    text: str


@dataclass(frozen=True)
class BinaryDocument:
    url: str
    content_type: str | None
    content: bytes


@dataclass(frozen=True)
class PageHashMetadata:
    url: str
    sha256: str
    size_bytes: int
    content_type: str | None
    last_modified: str | None


@dataclass(frozen=True)
class CatalogDiscoveryReport:
    catalog_slug: str
    title: str
    viewer_url: str
    selected: bool
    ignored_reason: str | None


@dataclass(frozen=True)
class ProcessedPageReport:
    page_number: int
    asset_url: str
    decision: str
    extraction_status: str
    asset_sha256: str
    asset_size_bytes: int
    asset_content_type: str | None
    source_last_modified: str | None


@dataclass(frozen=True)
class ProcessedCatalogReport:
    catalog_slug: str
    catalog_external_key: str
    viewer_url: str
    config_url: str
    total_detected_pages: int
    processed_pages: list[ProcessedPageReport]


@dataclass(frozen=True)
class RunReport:
    dry_run: bool
    source_url: str
    detected_catalogs: list[CatalogDiscoveryReport]
    processed_catalogs: list[ProcessedCatalogReport]
    temporary_files_remaining: int
    written_page_snapshots: int
    duration_seconds: float


@dataclass(frozen=True)
class PageExtractionReport:
    page_number: int
    page_dimensions: tuple[int, int]
    layout_type: str
    zone_count: int
    candidate_count: int
    reliable_count: int
    needs_review_count: int
    rejected_count: int
    examples: list[dict[str, object]]


@dataclass(frozen=True)
class LayoutClassificationRunReport:
    source_url: str
    catalog_slug: str
    catalog_title: str
    viewer_url: str
    config_url: str
    total_detected_pages: int
    analyzed_pages: list[PageLayoutAnalysis]
    selected_pages: list[PageLayoutAnalysis]
    detected_catalogs: list[CatalogDiscoveryReport]
    temporary_files_remaining: int
    duration_seconds: float
    report_path: str
    errors: list[str]


@dataclass(frozen=True)
class PromotionExtractionRunReport:
    source_url: str
    catalog_slug: str
    catalog_title: str
    viewer_url: str
    config_url: str
    total_detected_pages: int
    processed_pages: list[PageExtractionReport]
    detected_catalogs: list[CatalogDiscoveryReport]
    zones_detected: int
    candidates_extracted: int
    candidates_complete: int
    candidates_needs_review: int
    candidates_rejected: int
    duplicate_same_page: int
    duplicate_cross_page: int
    ai_consumption: int
    temporary_files_remaining: int
    duration_seconds: float
    report_path: str
    errors: list[str]
    candidates: list[PromotionCandidate]


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> TextDocument: ...
    def fetch_asset_metadata(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> PageHashMetadata: ...
    def fetch_binary(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> BinaryDocument: ...


class HttpFetcher:
    def __init__(self) -> None:
        self._last_domain_fetch: dict[str, float] = {}

    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> TextDocument:
        content, content_type, _ = self._read(url, allowed_hosts=allowed_hosts, settings=settings)
        return TextDocument(
            url=url,
            content_type=content_type,
            text=content.decode("utf-8", errors="ignore"),
        )

    def fetch_asset_metadata(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> PageHashMetadata:
        chunks, content_type, last_modified = self._read_stream(url, allowed_hosts=allowed_hosts, settings=settings)
        hash_result = hash_chunks(chunks)
        return PageHashMetadata(
            url=url,
            sha256=hash_result.sha256,
            size_bytes=hash_result.size_bytes,
            content_type=content_type,
            last_modified=last_modified,
        )

    def fetch_binary(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> BinaryDocument:
        content, content_type, _ = self._read(url, allowed_hosts=allowed_hosts, settings=settings)
        return BinaryDocument(url=url, content_type=content_type, content=content)

    def _read(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> tuple[bytes, str | None, str | None]:
        chunks, content_type, last_modified = self._read_stream(url, allowed_hosts=allowed_hosts, settings=settings)
        return b"".join(chunks), content_type, last_modified

    def _read_stream(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> tuple[list[bytes], str | None, str | None]:
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
                content_type = response.headers.get("Content-Type")
                last_modified = response.headers.get("Last-Modified")
                chunks: list[bytes] = []
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    chunks.append(chunk)
                return chunks, content_type, last_modified
        except urllib.error.HTTPError as exc:  # pragma: no cover - defensive network path
            raise RuntimeError(f"http_error:{exc.code}:{url}") from exc

    @staticmethod
    def _enforce_allowed_host(url: str, allowed_hosts: set[str]) -> None:
        host = (urlsplit(url).hostname or "").lower()
        normalized = {item.lower() for item in allowed_hosts}
        if host not in normalized:
            raise ValueError(f"url_out_of_allowed_domain:{url}")


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="BudgetKazPei promo products collector")
    parser.add_argument("--target-catalog", default=None, help="Catalog slug to process, defaults to 26runRDC.")
    parser.add_argument("--max-catalogs", type=int, default=None, help="Maximum number of catalogs to process.")
    parser.add_argument("--max-pages", type=int, default=None, help="Maximum number of pages to hash or extract.")
    parser.add_argument("--page-numbers", default=None, help="Comma-separated catalog page numbers to process.")
    parser.add_argument("--write-metadata", action="store_true", help="Persist page metadata instead of dry-run.")
    parser.add_argument("--classify-layouts", action="store_true", help="Classify page layouts for sampling.")
    parser.add_argument("--extract-products", action="store_true", help="Run the local product extraction prototype.")
    parser.add_argument("--leader-price-readonly", action="store_true", help="Run the readonly Leader Price structured collector.")
    parser.add_argument("--leader-price-import", action="store_true", help="Import the local Leader Price readonly report into Supabase staging.")
    parser.add_argument("--leader-price-incremental", action="store_true", help="Collect LP Ermitage, compare commercial state, and stage only changes.")
    parser.add_argument("--dry-run", action="store_true", help="Disable Supabase writes for incremental retail modes.")
    parser.add_argument("--leader-price-validation-job", action="store_true", help="Run the one-shot Leader Price import validation job.")
    parser.add_argument("--leader-price-validation-job-smoke", action="store_true", help="Run the offline smoke for the Leader Price validation job.")
    parser.add_argument("--carrefour-reunion-readonly", action="store_true", help="Run the readonly Carrefour Réunion SSR HTML collector.")
    parser.add_argument("--carrefour-reunion-incremental", action="store_true", help="Collect Carrefour Réunion and stage only commercial changes.")
    parser.add_argument("--carrefour-baseline-report", default=None, help="Optional local Carrefour readonly report used as incremental baseline.")
    parser.add_argument("--carrefour-report-path", default=None, help="Override the local Carrefour readonly or incremental report path.")
    parser.add_argument("--leader-max-products", type=int, default=100, help="Maximum Leader Price products to inspect.")
    parser.add_argument("--leader-report-path", default=None, help="Override the local Leader Price readonly report path.")
    parser.add_argument("--benchmark-vision", action="store_true", help="Run the three-page vision benchmark.")
    parser.add_argument("--report-path", default=None, help="Override the local JSON report output path.")
    parser.add_argument("--layout-report-path", default=None, help="Override the local layout JSON report output path.")
    parser.add_argument("--vision-report-path", default=None, help="Override the local vision benchmark JSON report path.")
    return parser


def run(
    settings: Settings,
    *,
    fetcher: Fetcher | None = None,
    repository: PageSnapshotRepository | None = None,
) -> RunReport:
    started = time.perf_counter()
    fetcher = fetcher or HttpFetcher()
    repository = repository or build_repository(
        supabase_url=settings.supabase_url,
        supabase_service_role_key=settings.supabase_service_role_key,
    )
    allowed_hosts = {settings.official_domain.lower(), f"www.{settings.official_domain.lower()}"}
    detected_reports: list[CatalogDiscoveryReport] = []
    processed_catalogs: list[ProcessedCatalogReport] = []
    try:
        detected_reports, selected_catalogs = _discover_catalog_selection(settings, fetcher, allowed_hosts=allowed_hosts)
        for catalog in selected_catalogs:
            viewer, page_assets = _fetch_catalog_assets(catalog, settings, fetcher, allowed_hosts=allowed_hosts)
            limited_assets = page_assets[: settings.max_pages] if settings.max_pages > 0 else page_assets
            catalog_external_key = f"{settings.source_slug}:{catalog.external_key_suffix}"
            catalog_id = repository.resolve_catalog_id(
                collector_source_slug=settings.source_slug,
                catalog_external_key=catalog_external_key,
            ) or catalog_external_key

            page_reports: list[ProcessedPageReport] = []
            for page in limited_assets:
                page_hash = fetcher.fetch_asset_metadata(page.asset_url, allowed_hosts=allowed_hosts, settings=settings)
                previous = repository.get_page_snapshot(catalog_id=catalog_id, page_number=page.page_number)
                decision = plan_page_snapshot(
                    catalog_id=catalog_id,
                    current=PageAssetMetadata(
                        page_number=page.page_number,
                        asset_url=page.asset_url,
                        asset_sha256=page_hash.sha256,
                        asset_content_type=page_hash.content_type,
                        asset_size_bytes=page_hash.size_bytes,
                        source_last_modified=page_hash.last_modified,
                    ),
                    previous=previous,
                    extraction_version=settings.extraction_version,
                    now=datetime.now(timezone.utc),
                )
                if not settings.dry_run:
                    repository.upsert_page_snapshot(decision.snapshot)
                page_reports.append(
                    ProcessedPageReport(
                        page_number=page.page_number,
                        asset_url=page.asset_url,
                        decision=decision.decision,
                        extraction_status=decision.snapshot.extraction_status,
                        asset_sha256=page_hash.sha256,
                        asset_size_bytes=page_hash.size_bytes,
                        asset_content_type=page_hash.content_type,
                        source_last_modified=page_hash.last_modified,
                    )
                )

            processed_catalogs.append(
                ProcessedCatalogReport(
                    catalog_slug=catalog.catalog_slug,
                    catalog_external_key=catalog_external_key,
                    viewer_url=catalog.viewer_url,
                    config_url=viewer.config_url,
                    total_detected_pages=len(page_assets),
                    processed_pages=page_reports,
                )
            )
    finally:
        _cleanup_temp_dir(settings.temp_dir)

    temp_dir = settings.temp_dir
    remaining = len(list(temp_dir.iterdir())) if temp_dir.exists() else 0
    written_page_snapshots = len(repository.upserts) if isinstance(repository, InMemoryPageSnapshotRepository) else 0
    return RunReport(
        dry_run=settings.dry_run,
        source_url=settings.source_url,
        detected_catalogs=detected_reports,
        processed_catalogs=processed_catalogs,
        temporary_files_remaining=remaining,
        written_page_snapshots=written_page_snapshots,
        duration_seconds=round(time.perf_counter() - started, 3),
    )


def run_product_extraction(
    settings: Settings,
    *,
    fetcher: Fetcher | None = None,
    ocr_client: CatalogProductOcr | None = None,
) -> PromotionExtractionRunReport:
    if settings.extraction_mode != "local":
        raise RuntimeError(f"unsupported_extraction_mode:{settings.extraction_mode}")
    if settings.vision_enabled:
        raise RuntimeError("vision_enabled_not_allowed_in_phase_2a")

    started = time.perf_counter()
    fetcher = fetcher or HttpFetcher()
    ocr_client = ocr_client or RapidOcrCliClient(python_executable=settings.ocr_python_executable)
    allowed_hosts = {settings.official_domain.lower(), f"www.{settings.official_domain.lower()}"}
    errors: list[str] = []
    detected_reports: list[CatalogDiscoveryReport] = []
    page_reports: list[PageExtractionReport] = []
    all_candidates: list[PromotionCandidate] = []
    zones_detected = 0
    total_detected_pages = 0
    viewer_url = ""
    config_url = ""
    catalog_title = ""
    catalog_slug = settings.target_catalog_slug

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
        limited_assets = _select_page_assets(page_assets, settings)

        for page in limited_assets:
            try:
                binary = fetcher.fetch_binary(page.asset_url, allowed_hosts=allowed_hosts, settings=settings)
                image_path = _write_temp_page_asset(settings.temp_dir, page.page_number, page.asset_url, binary.content_type, binary.content)
                ocr_page = ocr_client.analyze_image(image_path, page_number=page.page_number)
                layout_analysis = classify_page_layout(ocr_page)
                regions = detect_regions(ocr_page, layout_type=layout_analysis.layout_type)
                zones_detected += len(regions)
                candidates = extract_promotion_candidates(regions, catalog=catalog)
                all_candidates.extend(candidates)
                page_reports.append(
                    PageExtractionReport(
                        page_number=page.page_number,
                        page_dimensions=(ocr_page.image_width, ocr_page.image_height),
                        layout_type=layout_analysis.layout_type,
                        zone_count=len(regions),
                        candidate_count=len(candidates),
                        reliable_count=len([candidate for candidate in candidates if candidate.candidate_status == "reliable"]),
                        needs_review_count=len([candidate for candidate in candidates if candidate.candidate_status == "needs_review"]),
                        rejected_count=len([candidate for candidate in candidates if candidate.candidate_status == "rejected"]),
                        examples=[candidate.to_dict() for candidate in candidates[:3]],
                    )
                )
            except Exception as exc:  # pragma: no cover - exercised in real run only
                errors.append(f"page_{page.page_number}:{exc}")

        dedupe = annotate_duplicates(all_candidates)
        _write_report_json(settings.report_path, _promotion_report_to_json_object(
            settings=settings,
            detected_reports=detected_reports,
            page_reports=page_reports,
            candidates=all_candidates,
            zones_detected=zones_detected,
            dedupe=dedupe,
            duration_seconds=round(time.perf_counter() - started, 3),
            temporary_files_remaining=0,
            errors=errors,
            catalog_slug=catalog_slug,
            catalog_title=catalog_title,
            viewer_url=viewer_url,
            config_url=config_url,
            total_detected_pages=total_detected_pages,
        ))
    finally:
        _cleanup_temp_dir(settings.temp_dir)

    temporary_files_remaining = len(list(settings.temp_dir.iterdir())) if settings.temp_dir.exists() else 0
    return PromotionExtractionRunReport(
        source_url=settings.source_url,
        catalog_slug=catalog_slug,
        catalog_title=catalog_title,
        viewer_url=viewer_url,
        config_url=config_url,
        total_detected_pages=total_detected_pages,
        processed_pages=page_reports,
        detected_catalogs=detected_reports,
        zones_detected=zones_detected,
        candidates_extracted=len(all_candidates),
        candidates_complete=len([candidate for candidate in all_candidates if not candidate.is_duplicate and candidate.candidate_status == "reliable"]),
        candidates_needs_review=len([candidate for candidate in all_candidates if candidate.candidate_status == "needs_review"]),
        candidates_rejected=len([candidate for candidate in all_candidates if candidate.candidate_status == "rejected"]),
        duplicate_same_page=dedupe.duplicate_same_page if 'dedupe' in locals() else 0,
        duplicate_cross_page=dedupe.duplicate_cross_page if 'dedupe' in locals() else 0,
        ai_consumption=0,
        temporary_files_remaining=temporary_files_remaining,
        duration_seconds=round(time.perf_counter() - started, 3),
        report_path=str(settings.report_path),
        errors=errors,
        candidates=all_candidates,
    )


def run_layout_classification(
    settings: Settings,
    *,
    fetcher: Fetcher | None = None,
    ocr_client: CatalogProductOcr | None = None,
) -> LayoutClassificationRunReport:
    if settings.extraction_mode != "local":
        raise RuntimeError(f"unsupported_extraction_mode:{settings.extraction_mode}")
    if settings.vision_enabled:
        raise RuntimeError("vision_enabled_not_allowed_in_phase_2b")

    started = time.perf_counter()
    fetcher = fetcher or HttpFetcher()
    ocr_client = ocr_client or RapidOcrCliClient(python_executable=settings.ocr_python_executable)
    allowed_hosts = {settings.official_domain.lower(), f"www.{settings.official_domain.lower()}"}
    errors: list[str] = []
    detected_reports: list[CatalogDiscoveryReport] = []
    analyzed_pages: list[PageLayoutAnalysis] = []
    total_detected_pages = 0
    viewer_url = ""
    config_url = ""
    catalog_title = ""
    catalog_slug = settings.target_catalog_slug

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
        assets_to_analyze = _select_page_assets(page_assets, settings)

        for page in assets_to_analyze:
            try:
                source_url = page.thumbnail_url or page.asset_url
                binary = fetcher.fetch_binary(source_url, allowed_hosts=allowed_hosts, settings=settings)
                image_path = _write_temp_page_asset(settings.temp_dir, page.page_number, source_url, binary.content_type, binary.content)
                ocr_page = ocr_client.analyze_image(
                    image_path,
                    page_number=page.page_number,
                    max_dimension=settings.classification_max_dimension,
                )
                analyzed_pages.append(classify_page_layout(ocr_page))
            except Exception as exc:  # pragma: no cover - exercised in real run only
                errors.append(f"page_{page.page_number}:{exc}")

        selected_pages = select_representative_pages(analyzed_pages)
        _write_report_json(
            settings.layout_report_path,
            _layout_report_to_json_object(
                settings=settings,
                detected_reports=detected_reports,
                analyzed_pages=analyzed_pages,
                selected_pages=selected_pages,
                duration_seconds=round(time.perf_counter() - started, 3),
                temporary_files_remaining=0,
                errors=errors,
                catalog_slug=catalog_slug,
                catalog_title=catalog_title,
                viewer_url=viewer_url,
                config_url=config_url,
                total_detected_pages=total_detected_pages,
            ),
        )
    finally:
        _cleanup_temp_dir(settings.temp_dir)

    temporary_files_remaining = len(list(settings.temp_dir.iterdir())) if settings.temp_dir.exists() else 0
    return LayoutClassificationRunReport(
        source_url=settings.source_url,
        catalog_slug=catalog_slug,
        catalog_title=catalog_title,
        viewer_url=viewer_url,
        config_url=config_url,
        total_detected_pages=total_detected_pages,
        analyzed_pages=analyzed_pages,
        selected_pages=select_representative_pages(analyzed_pages),
        detected_catalogs=detected_reports,
        temporary_files_remaining=temporary_files_remaining,
        duration_seconds=round(time.perf_counter() - started, 3),
        report_path=str(settings.layout_report_path),
        errors=errors,
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
):
    viewer_page = fetcher.fetch_text(catalog.viewer_url, allowed_hosts=allowed_hosts, settings=settings)
    viewer = discover_viewer(viewer_page.text, catalog.viewer_url, allowed_hosts)
    config_js = fetcher.fetch_text(viewer.config_url, allowed_hosts=allowed_hosts, settings=settings)
    page_assets = extract_page_assets(config_js.text, viewer.config_url, allowed_hosts)
    return viewer, page_assets


def _select_page_assets(page_assets, settings: Settings):
    if settings.selected_page_numbers:
        selected = set(settings.selected_page_numbers)
        return [page for page in page_assets if page.page_number in selected]
    if settings.max_pages > 0:
        return page_assets[: settings.max_pages]
    return page_assets


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


def _write_report_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _parse_page_numbers_arg(value: str | None) -> tuple[int, ...] | None:
    if value is None:
        return None
    numbers: list[int] = []
    for token in value.split(","):
        cleaned = token.strip()
        if cleaned:
            numbers.append(int(cleaned))
    return tuple(numbers)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = build_argument_parser().parse_args()
    parsed_page_numbers = _parse_page_numbers_arg(args.page_numbers)
    settings = Settings.from_env().with_overrides(
        dry_run=False if args.write_metadata else None,
        max_catalogs=args.max_catalogs,
        max_pages=args.max_pages,
        target_catalog_slug=args.target_catalog,
        report_path=Path(args.report_path) if args.report_path else None,
        layout_report_path=Path(args.layout_report_path) if args.layout_report_path else None,
        vision_report_path=Path(args.vision_report_path) if args.vision_report_path else None,
        selected_page_numbers=parsed_page_numbers,
    )

    if args.classify_layouts:
        report = run_layout_classification(settings)
        print(json.dumps(_layout_report_to_json(report), ensure_ascii=False, indent=2))
        return 0

    if args.extract_products:
        report = run_product_extraction(settings)
        print(json.dumps(_promotion_report_to_json(report), ensure_ascii=False, indent=2))
        return 0

    if args.leader_price_readonly:
        report = run_leader_price_readonly(settings, fetcher=HttpFetcher(), max_products=args.leader_max_products)
        print(json.dumps(_leader_price_report_to_json(report), ensure_ascii=False, indent=2))
        return 0

    if args.leader_price_import:
        report = import_leader_price_report(
            settings,
            report_path=Path(args.leader_report_path) if args.leader_report_path else None,
            max_products=args.leader_max_products,
        )
        print(json.dumps(_leader_price_import_to_json(report), ensure_ascii=False, indent=2))
        return 0

    if args.leader_price_incremental:
        report = run_leader_price_incremental(
            settings,
            fetcher=HttpFetcher(),
            dry_run=args.dry_run,
            max_products=args.leader_max_products,
            report_path=Path(args.leader_report_path) if args.leader_report_path else None,
        )
        print(json.dumps(_leader_price_incremental_to_json(report), ensure_ascii=False, indent=2))
        return 0

    if args.leader_price_validation_job:
        report = run_leader_price_validation_job(settings, fetcher=HttpFetcher())
        print(json.dumps(_leader_price_validation_job_to_json(report), ensure_ascii=False, indent=2))
        return 0

    if args.leader_price_validation_job_smoke:
        report = build_validation_job_smoke_report(settings)
        print(json.dumps(_leader_price_validation_job_to_json(report), ensure_ascii=False, indent=2))
        print("VALIDATION_JOB_SMOKE_OK")
        return 0

    if args.carrefour_reunion_readonly:
        report = run_carrefour_reunion_readonly(
            settings,
            fetcher=HttpFetcher(),
            report_path=Path(args.carrefour_report_path) if args.carrefour_report_path else None,
        )
        print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))
        return 0

    if args.carrefour_reunion_incremental:
        report = run_carrefour_reunion_incremental(
            settings,
            fetcher=HttpFetcher(),
            dry_run=args.dry_run,
            baseline_report_path=(
                Path(args.carrefour_baseline_report)
                if args.carrefour_baseline_report
                else None
            ),
            report_path=Path(args.carrefour_report_path) if args.carrefour_report_path else None,
        )
        print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))
        return 0

    if args.benchmark_vision:
        report = run_vision_benchmark(settings)
        print(json.dumps(_vision_benchmark_report_to_json(report), ensure_ascii=False, indent=2))
        return 0

    report = run(settings)
    print(json.dumps(_report_to_json(report), ensure_ascii=False, indent=2))
    return 0


def _report_to_json(report: RunReport) -> dict[str, object]:
    return {
        "dry_run": report.dry_run,
        "source_url": report.source_url,
        "temporary_files_remaining": report.temporary_files_remaining,
        "written_page_snapshots": report.written_page_snapshots,
        "duration_seconds": report.duration_seconds,
        "detected_catalogs": [asdict(item) for item in report.detected_catalogs],
        "processed_catalogs": [
            {
                "catalog_slug": item.catalog_slug,
                "catalog_external_key": item.catalog_external_key,
                "viewer_url": item.viewer_url,
                "config_url": item.config_url,
                "total_detected_pages": item.total_detected_pages,
                "processed_pages": [asdict(page) for page in item.processed_pages],
            }
            for item in report.processed_catalogs
        ],
    }


def _promotion_report_to_json(report: PromotionExtractionRunReport) -> dict[str, object]:
    return {
        "source_url": report.source_url,
        "catalog_slug": report.catalog_slug,
        "catalog_title": report.catalog_title,
        "viewer_url": report.viewer_url,
        "config_url": report.config_url,
        "total_detected_pages": report.total_detected_pages,
        "processed_pages": [asdict(item) for item in report.processed_pages],
        "detected_catalogs": [asdict(item) for item in report.detected_catalogs],
        "zones_detected": report.zones_detected,
        "candidates_extracted": report.candidates_extracted,
        "candidates_complete": report.candidates_complete,
        "candidates_needs_review": report.candidates_needs_review,
        "candidates_rejected": report.candidates_rejected,
        "duplicate_same_page": report.duplicate_same_page,
        "duplicate_cross_page": report.duplicate_cross_page,
        "ai_consumption": report.ai_consumption,
        "temporary_files_remaining": report.temporary_files_remaining,
        "duration_seconds": report.duration_seconds,
        "report_path": report.report_path,
        "errors": list(report.errors),
        "candidates": [candidate.to_dict() for candidate in report.candidates],
    }


def _layout_report_to_json(report: LayoutClassificationRunReport) -> dict[str, object]:
    return {
        "source_url": report.source_url,
        "catalog_slug": report.catalog_slug,
        "catalog_title": report.catalog_title,
        "viewer_url": report.viewer_url,
        "config_url": report.config_url,
        "total_detected_pages": report.total_detected_pages,
        "analyzed_pages": [item.to_dict() for item in report.analyzed_pages],
        "selected_pages": [item.to_dict() for item in report.selected_pages],
        "detected_catalogs": [asdict(item) for item in report.detected_catalogs],
        "temporary_files_remaining": report.temporary_files_remaining,
        "duration_seconds": report.duration_seconds,
        "report_path": report.report_path,
        "errors": list(report.errors),
    }


def _vision_benchmark_report_to_json(report: VisionBenchmarkRunReport) -> dict[str, object]:
    return report.to_dict()


def _leader_price_report_to_json(report: LeaderPriceReadonlyRunReport) -> dict[str, object]:
    return report.to_dict()


def _leader_price_import_to_json(report: LeaderPriceImportSummary) -> dict[str, object]:
    return report.to_dict()


def _leader_price_incremental_to_json(report: LeaderPriceIncrementalReport) -> dict[str, object]:
    return report.to_dict()


def _leader_price_validation_job_to_json(report: LeaderPriceValidationJobReport) -> dict[str, object]:
    return report.to_dict()


def _promotion_report_to_json_object(
    *,
    settings: Settings,
    detected_reports: list[CatalogDiscoveryReport],
    page_reports: list[PageExtractionReport],
    candidates: list[PromotionCandidate],
    zones_detected: int,
    dedupe: DeduplicationSummary,
    duration_seconds: float,
    temporary_files_remaining: int,
    errors: list[str],
    catalog_slug: str,
    catalog_title: str,
    viewer_url: str,
    config_url: str,
    total_detected_pages: int,
) -> dict[str, object]:
    return {
        "catalogue": {
            "source_url": settings.source_url,
            "catalog_slug": catalog_slug,
            "catalog_title": catalog_title,
            "viewer_url": viewer_url,
            "config_url": config_url,
            "total_detected_pages": total_detected_pages,
            "pages_processed": [page.page_number for page in page_reports],
        },
        "duration_seconds": duration_seconds,
        "zones_detected": zones_detected,
        "candidates_extracted": len(candidates),
        "candidates_complete": len([candidate for candidate in candidates if not candidate.is_duplicate and candidate.candidate_status == "reliable"]),
        "candidates_needs_review": len([candidate for candidate in candidates if candidate.candidate_status == "needs_review"]),
        "candidates_rejected": len([candidate for candidate in candidates if candidate.candidate_status == "rejected"]),
        "duplicate_same_page": dedupe.duplicate_same_page,
        "duplicate_cross_page": dedupe.duplicate_cross_page,
        "ai_consumption": 0,
        "temporary_files_remaining": temporary_files_remaining,
        "errors": list(errors),
        "detected_catalogs": [asdict(item) for item in detected_reports],
        "pages": [asdict(item) for item in page_reports],
        "candidates": [candidate.to_dict() for candidate in candidates],
    }


def _layout_report_to_json_object(
    *,
    settings: Settings,
    detected_reports: list[CatalogDiscoveryReport],
    analyzed_pages: list[PageLayoutAnalysis],
    selected_pages: list[PageLayoutAnalysis],
    duration_seconds: float,
    temporary_files_remaining: int,
    errors: list[str],
    catalog_slug: str,
    catalog_title: str,
    viewer_url: str,
    config_url: str,
    total_detected_pages: int,
) -> dict[str, object]:
    return {
        "catalogue": {
            "source_url": settings.source_url,
            "catalog_slug": catalog_slug,
            "catalog_title": catalog_title,
            "viewer_url": viewer_url,
            "config_url": config_url,
            "total_detected_pages": total_detected_pages,
        },
        "duration_seconds": duration_seconds,
        "temporary_files_remaining": temporary_files_remaining,
        "errors": list(errors),
        "detected_catalogs": [asdict(item) for item in detected_reports],
        "pages": [item.to_dict() for item in analyzed_pages],
        "selected_pages": [item.to_dict() for item in selected_pages],
    }


def _cleanup_temp_dir(temp_dir: Path) -> None:
    if not temp_dir.exists():
        return
    for child in temp_dir.iterdir():
        if child.is_dir():
            for nested in child.rglob("*"):
                if nested.is_file():
                    nested.unlink()
            for nested_dir in sorted((item for item in child.rglob("*") if item.is_dir()), reverse=True):
                nested_dir.rmdir()
            child.rmdir()
        else:
            child.unlink()
    temp_dir.rmdir()


if __name__ == "__main__":
    raise SystemExit(main())
