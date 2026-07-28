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
from app.db.repositories import InMemoryPageSnapshotRepository, PageSnapshotRepository, build_repository
from app.extractors.fliphtml5_pages import FlipHtml5Viewer, PageAsset, discover_viewer, extract_page_assets
from app.services.hashing import StreamHashResult, hash_chunks
from app.services.page_fingerprint import PageAssetMetadata, PageDecision, plan_page_snapshot
from app.settings import Settings


@dataclass(frozen=True)
class TextDocument:
    url: str
    content_type: str | None
    text: str


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


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> TextDocument: ...
    def fetch_asset_metadata(self, url: str, *, allowed_hosts: set[str], settings: Settings) -> PageHashMetadata: ...


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
    parser.add_argument("--max-pages", type=int, default=None, help="Maximum number of pages to hash.")
    parser.add_argument("--write-metadata", action="store_true", help="Persist page metadata instead of dry-run.")
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
        official_page = fetcher.fetch_text(settings.source_url, allowed_hosts=allowed_hosts, settings=settings)
        catalogs = discover_catalogs(official_page.text, official_page.url, settings.official_domain)

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

        for catalog in selected_catalogs:
            viewer_page = fetcher.fetch_text(catalog.viewer_url, allowed_hosts=allowed_hosts, settings=settings)
            viewer = discover_viewer(viewer_page.text, catalog.viewer_url, allowed_hosts)
            config_js = fetcher.fetch_text(viewer.config_url, allowed_hosts=allowed_hosts, settings=settings)
            page_assets = extract_page_assets(config_js.text, viewer.config_url, allowed_hosts)
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


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = build_argument_parser().parse_args()
    settings = Settings.from_env().with_overrides(
        dry_run=False if args.write_metadata else None,
        max_catalogs=args.max_catalogs,
        max_pages=args.max_pages,
        target_catalog_slug=args.target_catalog,
    )
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
