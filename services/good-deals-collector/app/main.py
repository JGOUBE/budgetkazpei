from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from uuid import uuid4

from app.collectors.html_collector import HtmlCollector
from app.collectors.image_collector import ImageCollector
from app.collectors.pdf_collector import PdfCollector
from app.collectors.registry import get_default_sources
from app.config import Settings
from app.db.publisher import PublisherService
from app.db.repositories import DryRunRepositories, InMemoryRepositories, RepositoryProtocol, SupabaseRepositories
from app.db.supabase_client import SupabaseAdminClient
from app.logging_config import configure_logging
from app.models.document import SourceDocument
from app.models.result import RunSummary, SourceProcessingResult
from app.parsers.auchan_saint_louis import AuchanSaintLouisParser
from app.parsers.carrefour_reunion import CarrefourReunionParser
from app.parsers.eleclerc_reunion import EleclercReunionParser
from app.parsers.generic_catalog import GenericCatalogParser
from app.parsers.generic_event import GenericEventParser
from app.parsers.generic_permanent_leisure import GenericPermanentLeisureParser
from app.parsers.magasins_u_reunion import MagasinsUReunionParser
from app.parsers.run_market_reunion import RunMarketReunionParser
from app.parsers.saint_paul_events import SaintPaulEventsParser
from app.parsers.ville_port_permanent_leisure import VillePortPermanentLeisureParser
from app.services.confidence import score_candidate
from app.services.deduplication import build_duplicate_key
from app.services.expiration import is_expired
from app.services.scheduler_mode import normalize_mode, source_allowed_in_mode
from app.services.source_fingerprint import build_source_fingerprint

LOGGER = logging.getLogger("budgetkazpei.collector")


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="BudgetKazPei good deals collector")
    parser.add_argument("--mode", default=None, help="full, shopping, events, permanent, dry-run")
    parser.add_argument("--dry-run", action="store_true", help="Run the collector without publishing")
    parser.add_argument("--max-sources", type=int, default=None, help="Limit the number of active sources")
    parser.add_argument("--source-slug", default=None, help="Collect a single source slug, including inactive sources")
    return parser


def get_repository(settings: Settings) -> RepositoryProtocol:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return InMemoryRepositories()
    technical_repository = SupabaseRepositories(
        SupabaseAdminClient(settings.supabase_url, settings.supabase_service_role_key),
        allow_source_writes=not settings.collector_dry_run,
    )
    if settings.collector_dry_run:
        return DryRunRepositories(technical_repository)
    return technical_repository


def get_collectors():
    return {
        "html": HtmlCollector(),
        "pdf": PdfCollector(),
        "image": ImageCollector(),
    }


def get_parsers():
    generic_catalog = GenericCatalogParser()
    generic_event = GenericEventParser()
    generic_permanent = GenericPermanentLeisureParser()
    return {
        "generic_catalog": generic_catalog,
        "generic_event": generic_event,
        "generic_permanent_leisure": generic_permanent,
        "carrefour_reunion": CarrefourReunionParser(),
        "magasins_u_reunion": MagasinsUReunionParser(),
        "run_market_reunion": RunMarketReunionParser(),
        "auchan_saint_louis": AuchanSaintLouisParser(),
        "eleclerc_reunion": EleclercReunionParser(),
        "saint_paul_events": SaintPaulEventsParser(),
        "ville_port_permanent_leisure": VillePortPermanentLeisureParser(),
    }


def _source_is_supported(source, parsers) -> bool:
    if source.parser_key == "pending":
        return False
    if source.parser_key in parsers:
        return True
    if source.content_family == "shopping":
        return "generic_catalog" in parsers
    if source.content_family == "event":
        return "generic_event" in parsers
    if source.content_family == "permanent_leisure":
        return "generic_permanent_leisure" in parsers
    return False


def select_sources(settings: Settings, parsers, *, requested_max_sources: int | None = None):
    all_sources = get_default_sources()
    if settings.collector_source_slug:
        selected_sources = [source for source in all_sources if source.slug == settings.collector_source_slug]
        available_sources = selected_sources
        effective_max_sources = None
    else:
        available_sources = [
            source
            for source in all_sources
            if source.is_active and source_allowed_in_mode(source.content_family, settings.collector_mode) and _source_is_supported(source, parsers)
        ]
        effective_max_sources = settings.collector_max_sources
        if effective_max_sources >= 0:
            selected_sources = available_sources[:effective_max_sources]
        else:
            selected_sources = available_sources

    LOGGER.info(
        "Selected collector sources",
        extra={
            "action": "source_selection",
            "result": "selected",
            "requested_max_sources": settings.collector_max_sources if requested_max_sources is None else requested_max_sources,
            "effective_max_sources": effective_max_sources,
            "available_sources_count": len(available_sources),
            "selected_sources_count": len(selected_sources),
            "selected_source_slugs": [source.slug for source in selected_sources],
        },
    )
    return selected_sources


def run(settings: Settings, *, requested_max_sources: int | None = None) -> RunSummary:
    collectors = get_collectors()
    parsers = get_parsers()
    sources = select_sources(settings, parsers, requested_max_sources=requested_max_sources)
    run_key = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    repositories = get_repository(settings)
    publisher = PublisherService(repositories)
    repositories.start_run(run_key, "manual", settings.collector_mode)

    summary = RunSummary(run_key=run_key, status="running", sources_total=len(sources))
    for source in sources:
        result = process_source(source, settings, repositories, collectors, parsers, publisher)
        summary.sources_checked += 1
        if result.changed:
            summary.sources_changed += 1
        if result.error_message:
            summary.errors_count += 1
            summary.error_summary.append({"source_slug": source.slug, "error": result.error_message})
            continue
        if result.skipped_reason == "unchanged":
            continue
        summary.documents_processed += 1
        for candidate in result.candidates:
            summary.candidates_detected += 1
            if candidate.status == "published":
                summary.candidates_published += 1
            elif candidate.status == "needs_review":
                summary.candidates_needing_review += 1
            elif candidate.status == "duplicate":
                summary.duplicates_detected += 1
            elif candidate.status == "rejected":
                summary.rejected_count += 1
            elif candidate.status == "expired":
                summary.expired_count += 1
    summary.status = "completed_with_errors" if summary.errors_count else "completed"
    repositories.finish_run(summary)
    return summary


def process_source(source, settings, repositories, collectors, parsers, publisher) -> SourceProcessingResult:
    collector = collectors[source.source_type]
    parser = parsers.get(source.parser_key)
    if parser is None:
        parser = parsers["generic_catalog" if source.content_family == "shopping" else "generic_event"]
    if source.parser_key == "pending":
        return SourceProcessingResult(source_slug=source.slug, changed=False, skipped_reason="pending_parser")
    source_id = repositories.ensure_source(source)
    try:
        document = collector.collect(source, settings)
        fingerprint = build_source_fingerprint(source, document)
        document.sha256 = fingerprint.sha256
        previous_hash = repositories.get_last_snapshot_hash(source.slug)
        changed = previous_hash != document.sha256
        LOGGER.info(
            "Source fingerprint computed",
            extra={
                "source_slug": source.slug,
                "content_family": source.content_family,
                "action": "fingerprint",
                "result": "computed",
                "fingerprint_strategy": fingerprint.strategy,
                "catalog_count": fingerprint.catalog_count,
                "semantic_items_count": fingerprint.semantic_items_count,
                "fingerprint_hash_prefix": fingerprint.sha256[:12],
                "changed": changed,
                "processing_status": "parsed" if changed else "skipped_unchanged",
            },
        )
        if not changed:
            repositories.record_snapshot(source.slug, source_id, document, changed, "skipped_unchanged")
            return SourceProcessingResult(source_slug=source.slug, changed=False, skipped_reason="unchanged")
        candidates = parser.parse(source, document)
        snapshot_id = repositories.record_snapshot(source.slug, source_id, document, changed, "parsed")
        for candidate in candidates:
            candidate.duplicate_key = build_duplicate_key(candidate)
            duplicate_id = repositories.find_duplicate_candidate_id(candidate.duplicate_key)
            if duplicate_id and duplicate_id != candidate.external_key:
                candidate.possible_duplicate_id = duplicate_id
                candidate.status = "duplicate"
            score, reasons, errors, status = score_candidate(candidate)
            candidate.confidence_score = score
            candidate.confidence_reasons = reasons
            candidate.validation_errors = errors
            if is_expired(candidate):
                candidate.status = "expired"
            elif candidate.status != "duplicate":
                candidate.status = status
            repositories.save_candidate(source_id, snapshot_id, candidate)
            if not settings.collector_dry_run and candidate.status == "approved":
                published_id = publisher.publish_candidate(candidate)
                if published_id:
                    candidate.status = "published"
                    candidate.published_good_deal_id = published_id
        return SourceProcessingResult(source_slug=source.slug, changed=True, candidates=candidates)
    except Exception as exc:  # pragma: no cover - defensive logging path
        repositories.record_snapshot(
            source.slug,
            source_id,
            document if "document" in locals() else _build_error_document(source),
            changed=False,
            status="failed",
            error_message=str(exc),
        )
        LOGGER.exception("Source processing failed", extra={"source_slug": source.slug, "action": "process_source", "result": "failed", "error_type": exc.__class__.__name__})
        return SourceProcessingResult(source_slug=source.slug, changed=False, error_message=str(exc))


def _build_error_document(source) -> SourceDocument:
    return SourceDocument(
        source_slug=source.slug,
        source_url=source.source_url,
        final_url=None,
        content_type=None,
        http_status=None,
        content_bytes=b"",
        extracted_text="",
        sha256=None,
        content_length_hint=None,
    )


def main() -> int:
    args = build_argument_parser().parse_args()
    base_settings = Settings.from_env()
    settings = base_settings.with_overrides(
        collector_mode=normalize_mode(args.mode or base_settings.collector_mode),
        collector_dry_run=True if args.dry_run else None,
        collector_source_slug=args.source_slug,
        collector_max_sources=args.max_sources,
    )
    configure_logging(settings.collector_log_level)
    summary = run(settings, requested_max_sources=args.max_sources)
    print(
        f"sources_checked={summary.sources_checked} "
        f"changes={summary.sources_changed} "
        f"candidates={summary.candidates_detected} "
        f"published={summary.candidates_published} "
        f"needs_review={summary.candidates_needing_review} "
        f"duplicates={summary.duplicates_detected} "
        f"errors={summary.errors_count}"
    )
    return 0 if summary.status in {"completed", "completed_with_errors"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
