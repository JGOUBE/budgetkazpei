from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol

from app.models.candidate import Candidate
from app.models.document import SourceDocument
from app.models.result import ExpirationMaintenanceResult, RunSummary
from app.models.source import SourceDefinition

from .supabase_client import SupabaseAdminClient


def _as_utc(value: datetime | str | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class RepositoryProtocol(Protocol):
    def start_run(self, run_key: str, trigger_type: str, mode: str) -> None: ...
    def finish_run(self, summary: RunSummary) -> None: ...
    def ensure_source(self, source: SourceDefinition) -> str: ...
    def get_last_snapshot_hash(self, source_slug: str) -> str | None: ...
    def record_snapshot(self, source_slug: str, source_id: str, document: SourceDocument, changed: bool, status: str, error_message: str | None = None) -> str: ...
    def save_candidate(self, source_id: str, snapshot_id: str | None, candidate: Candidate) -> str: ...
    def find_duplicate_candidate_id(self, duplicate_key: str) -> str | None: ...
    def find_saved_candidate(self, source_slug: str, external_key: str) -> Candidate | None: ...
    def mark_candidate(self, candidate: Candidate, *, status: str, published_good_deal_id: str | None = None) -> None: ...
    def expire_stale_records(self, *, dry_run: bool, now: datetime | None = None) -> ExpirationMaintenanceResult: ...
    def list_candidates_pending_publication(self) -> list[Candidate]: ...
    def upsert_business(self, payload: dict[str, object]) -> str | None: ...
    def upsert_store_location(self, payload: dict[str, object]) -> str | None: ...
    def upsert_product(self, payload: dict[str, object]) -> str | None: ...
    def upsert_product_alias(self, payload: dict[str, object]) -> str | None: ...
    def upsert_catalog(self, payload: dict[str, object]) -> str | None: ...
    def upsert_promotion(self, payload: dict[str, object]) -> str | None: ...
    def upsert_good_deal(self, payload: dict[str, object]) -> str | None: ...


@dataclass
class InMemoryRepositories:
    runs: dict[str, RunSummary] = field(default_factory=dict)
    sources: dict[str, dict[str, object]] = field(default_factory=dict)
    snapshots: dict[str, dict[str, object]] = field(default_factory=dict)
    candidates: dict[str, Candidate] = field(default_factory=dict)
    duplicates: dict[str, str] = field(default_factory=dict)
    businesses: dict[str, dict[str, object]] = field(default_factory=dict)
    stores: dict[str, dict[str, object]] = field(default_factory=dict)
    products: dict[str, dict[str, object]] = field(default_factory=dict)
    aliases: dict[str, dict[str, object]] = field(default_factory=dict)
    catalogs: dict[str, dict[str, object]] = field(default_factory=dict)
    promotions: dict[str, dict[str, object]] = field(default_factory=dict)
    good_deals: dict[str, dict[str, object]] = field(default_factory=dict)

    @staticmethod
    def _candidate_storage_key(source_slug: str, external_key: str) -> str:
        return f"{source_slug}|{external_key}"

    def start_run(self, run_key: str, trigger_type: str, mode: str) -> None:
        self.runs[run_key] = RunSummary(run_key=run_key, status="running")

    def finish_run(self, summary: RunSummary) -> None:
        self.runs[summary.run_key] = summary

    def ensure_source(self, source: SourceDefinition) -> str:
        source_id = f"source:{source.slug}"
        self.sources[source.slug] = {"id": source_id, "source": source}
        return source_id

    def get_last_snapshot_hash(self, source_slug: str) -> str | None:
        for snapshot in reversed(list(self.snapshots.values())):
            if snapshot["source_slug"] == source_slug and snapshot.get("sha256"):
                return snapshot["sha256"]  # type: ignore[return-value]
        return None

    def record_snapshot(
        self,
        source_slug: str,
        source_id: str,
        document: SourceDocument,
        changed: bool,
        status: str,
        error_message: str | None = None,
    ) -> str:
        snapshot_id = f"snapshot:{source_slug}:{len(self.snapshots)+1}"
        self.snapshots[snapshot_id] = {
            "id": snapshot_id,
            "source_slug": source_slug,
            "source_id": source_id,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "http_status": document.http_status,
            "final_url": document.final_url,
            "content_type": document.content_type,
            "content_length": document.content_length,
            "sha256": document.sha256,
            "changed": changed,
            "status": status,
            "error_message": error_message,
        }
        return snapshot_id

    def save_candidate(self, source_id: str, snapshot_id: str | None, candidate: Candidate) -> str:
        candidate.source_id = source_id
        candidate.snapshot_id = snapshot_id
        if candidate.detected_at is None:
            candidate.detected_at = datetime.now(timezone.utc)
        storage_key = self._candidate_storage_key(candidate.source_slug, candidate.external_key)
        self.candidates[storage_key] = candidate
        if candidate.duplicate_key:
            self.duplicates.setdefault(candidate.duplicate_key, storage_key)
        return storage_key

    def find_duplicate_candidate_id(self, duplicate_key: str) -> str | None:
        return self.duplicates.get(duplicate_key)

    def find_saved_candidate(self, source_slug: str, external_key: str) -> Candidate | None:
        return self.candidates.get(self._candidate_storage_key(source_slug, external_key))

    def mark_candidate(self, candidate: Candidate, *, status: str, published_good_deal_id: str | None = None) -> None:
        candidate = self.candidates[self._candidate_storage_key(candidate.source_slug, candidate.external_key)]
        candidate.status = status
        candidate.published_good_deal_id = published_good_deal_id
        if status == "published":
            candidate.published_at = datetime.now(timezone.utc)
        if status == "expired":
            candidate.rejected_at = None

    def expire_stale_records(self, *, dry_run: bool, now: datetime | None = None) -> ExpirationMaintenanceResult:
        current = now or datetime.now(timezone.utc)
        expired_good_deals = [
            row
            for row in self.good_deals.values()
            if row.get("collector_source_slug")
            and row.get("is_active") is not False
            and row.get("content_kind") != "permanent_leisure"
            and _as_utc(row.get("ends_at"))
            and _as_utc(row.get("ends_at")) < current
        ]
        expired_promotions = [
            row
            for row in self.promotions.values()
            if row.get("collector_source_slug")
            and row.get("is_active") is not False
            and _as_utc(row.get("ends_at"))
            and _as_utc(row.get("ends_at")) < current
        ]
        expired_catalogs = [
            row
            for row in self.catalogs.values()
            if row.get("collector_source_slug")
            and row.get("is_active") is not False
            and _as_utc(row.get("ends_at"))
            and _as_utc(row.get("ends_at")) < current
        ]
        expired_candidates = [
            candidate
            for candidate in self.candidates.values()
            if candidate.status in {"detected", "needs_review", "approved"}
            and candidate.content_kind != "permanent_leisure"
            and _as_utc(candidate.ends_at)
            and _as_utc(candidate.ends_at) < current
        ]
        if not dry_run:
            for row in expired_good_deals:
                row["is_active"] = False
                row["source_still_available"] = False
                row["availability_status"] = "expired"
                row["updated_at"] = current.isoformat()
            for row in expired_promotions:
                row["is_active"] = False
                row["updated_at"] = current.isoformat()
            for row in expired_catalogs:
                row["is_active"] = False
                row["updated_at"] = current.isoformat()
            for candidate in expired_candidates:
                candidate.status = "expired"
        return ExpirationMaintenanceResult(
            dry_run=dry_run,
            good_deals=len(expired_good_deals),
            promotions=len(expired_promotions),
            catalogs=len(expired_catalogs),
            candidates=len(expired_candidates),
        )

    def list_candidates_pending_publication(self) -> list[Candidate]:
        return [
            candidate
            for candidate in self.candidates.values()
            if candidate.status == "approved" and not candidate.published_good_deal_id
        ]

    def _upsert_by_key(self, table: dict[str, dict[str, object]], key: str, payload: dict[str, object]) -> str | None:
        if not key:
            return None
        row_id = key
        table[row_id] = {**table.get(row_id, {}), **payload, "id": row_id}
        return row_id

    def upsert_business(self, payload: dict[str, object]) -> str | None:
        return self._upsert_by_key(self.businesses, str(payload.get("slug") or payload.get("name") or ""), payload)

    def upsert_store_location(self, payload: dict[str, object]) -> str | None:
        key = f"{payload.get('retailer_slug')}|{payload.get('store_name')}|{payload.get('commune')}"
        return self._upsert_by_key(self.stores, key, payload)

    def upsert_product(self, payload: dict[str, object]) -> str | None:
        key = f"{payload.get('normalized_name')}|{payload.get('brand')}|{payload.get('size_label')}"
        return self._upsert_by_key(self.products, key, payload)

    def upsert_product_alias(self, payload: dict[str, object]) -> str | None:
        key = f"{payload.get('product_id')}|{payload.get('normalized_alias')}"
        return self._upsert_by_key(self.aliases, key, payload)

    def upsert_catalog(self, payload: dict[str, object]) -> str | None:
        key = f"{payload.get('collector_source_slug')}|{payload.get('external_key')}"
        return self._upsert_by_key(self.catalogs, key, payload)

    def upsert_promotion(self, payload: dict[str, object]) -> str | None:
        key = f"{payload.get('collector_source_slug')}|{payload.get('external_key')}"
        return self._upsert_by_key(self.promotions, key, payload)

    def upsert_good_deal(self, payload: dict[str, object]) -> str | None:
        key = f"{payload.get('collector_source_slug')}|{payload.get('external_key')}"
        return self._upsert_by_key(self.good_deals, key, payload)


class SupabaseRepositories:
    def __init__(self, client: SupabaseAdminClient, *, allow_source_writes: bool = True) -> None:
        self.client = client
        self.allow_source_writes = allow_source_writes

    @staticmethod
    def _null_safe_filter(column: str, value: object | None) -> tuple[str, str]:
        if value is None:
            return column, "is.null"
        return column, f"eq.{value}"

    def start_run(self, run_key: str, trigger_type: str, mode: str) -> None:
        self.client.upsert(
            "good_deal_ingestion_runs",
            [{"run_key": run_key, "trigger_type": trigger_type, "mode": mode, "status": "running"}],
            on_conflict="run_key",
        )

    def finish_run(self, summary: RunSummary) -> None:
        self.client.patch(
            "good_deal_ingestion_runs",
            filters={"run_key": f"eq.{summary.run_key}"},
            values={
                "status": summary.status,
                "sources_total": summary.sources_total,
                "sources_checked": summary.sources_checked,
                "sources_changed": summary.sources_changed,
                "documents_processed": summary.documents_processed,
                "candidates_detected": summary.candidates_detected,
                "candidates_published": summary.candidates_published,
                "candidates_needing_review": summary.candidates_needing_review,
                "duplicates_detected": summary.duplicates_detected,
                "rejected_count": summary.rejected_count,
                "expired_count": summary.expired_count,
                "errors_count": summary.errors_count,
                "error_summary": summary.error_summary,
                "metrics": summary.metrics,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def ensure_source(self, source: SourceDefinition) -> str:
        existing_rows = self.client.select(
            "good_deal_sources",
            filters={"slug": f"eq.{source.slug}", "limit": "1"},
        )
        if existing_rows:
            return str(existing_rows[0]["id"])
        if not self.allow_source_writes:
            raise LookupError(f"Collector source '{source.slug}' is missing from good_deal_sources.")
        now = datetime.now(timezone.utc).isoformat()
        row = {
            "name": source.name,
            "slug": source.slug,
            "content_family": source.content_family,
            "source_type": source.source_type,
            "retailer_slug": source.retailer_slug,
            "organizer_name": source.organizer_name,
            "source_url": source.source_url,
            "official_domain": source.official_domain,
            "commune": source.commune,
            "micro_region": source.micro_region,
            "scope_type": source.scope_type,
            "parser_key": source.parser_key,
            "check_frequency": source.check_frequency,
            "trust_level": source.trust_level,
            "is_official": source.is_official,
            "is_active": source.is_active,
            "updated_at": now,
        }
        rows = self.client.upsert("good_deal_sources", [row], on_conflict="slug")
        return str(rows[0]["id"])

    def get_last_snapshot_hash(self, source_slug: str) -> str | None:
        rows = self.client.select(
            "good_deal_source_snapshots",
            filters={"source_slug": f"eq.{source_slug}", "sha256": "not.is.null", "order": "checked_at.desc", "limit": "1"},
        )
        return str(rows[0]["sha256"]) if rows else None

    def record_snapshot(
        self,
        source_slug: str,
        source_id: str,
        document: SourceDocument,
        changed: bool,
        status: str,
        error_message: str | None = None,
    ) -> str:
        rows = self.client.insert(
            "good_deal_source_snapshots",
            [
                {
                    "source_slug": source_slug,
                    "source_id": source_id,
                    "http_status": document.http_status,
                    "final_url": document.final_url,
                    "content_type": document.content_type,
                    "content_length": document.content_length,
                    "sha256": document.sha256,
                    "etag": document.etag,
                    "last_modified_header": document.last_modified_header,
                    "changed": changed,
                    "processing_status": status,
                    "error_message": error_message,
                }
            ],
        )
        return str(rows[0]["id"])

    def save_candidate(self, source_id: str, snapshot_id: str | None, candidate: Candidate) -> str:
        candidate.source_id = source_id
        candidate.snapshot_id = snapshot_id
        row = candidate.as_seed_row() | {
            "source_id": source_id,
            "snapshot_id": snapshot_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        rows = self.client.upsert("good_deal_candidates", [row], on_conflict="source_id,external_key")
        return str(rows[0]["id"])

    def find_duplicate_candidate_id(self, duplicate_key: str) -> str | None:
        rows = self.client.select("good_deal_candidates", filters={"duplicate_key": f"eq.{duplicate_key}", "limit": "1"})
        return str(rows[0]["id"]) if rows else None

    def find_saved_candidate(self, source_slug: str, external_key: str) -> Candidate | None:
        return None

    def mark_candidate(self, candidate: Candidate, *, status: str, published_good_deal_id: str | None = None) -> None:
        values: dict[str, object] = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
        if published_good_deal_id:
            values["published_good_deal_id"] = published_good_deal_id
            values["published_at"] = datetime.now(timezone.utc).isoformat()
        self.client.patch(
            "good_deal_candidates",
            filters={"external_key": f"eq.{candidate.external_key}", "source_id": f"eq.{candidate.source_id}"},
            values=values,
        )

    def _patch_ids(self, table: str, ids: list[str], values: dict[str, object]) -> None:
        if not ids:
            return
        id_list = ",".join(ids)
        self.client.patch(table, filters={"id": f"in.({id_list})"}, values=values)

    def expire_stale_records(self, *, dry_run: bool, now: datetime | None = None) -> ExpirationMaintenanceResult:
        current = now or datetime.now(timezone.utc)
        current_iso = current.isoformat()

        good_deals = self.client.select(
            "good_deals",
            filters={
                "collector_source_slug": "not.is.null",
                "is_active": "eq.true",
                "source_still_available": "is.true",
                "content_kind": "neq.permanent_leisure",
                "ends_at": f"lt.{current_iso}",
            },
            columns="id",
        )
        promotions = self.client.select(
            "shopping_promotions",
            filters={
                "collector_source_slug": "not.is.null",
                "is_active": "eq.true",
                "ends_at": f"lt.{current_iso}",
            },
            columns="id",
        )
        catalogs = self.client.select(
            "shopping_catalogs",
            filters={
                "collector_source_slug": "not.is.null",
                "is_active": "eq.true",
                "ends_at": f"lt.{current_iso}",
            },
            columns="id",
        )
        candidates = self.client.select(
            "good_deal_candidates",
            filters={
                "status": "in.(detected,needs_review,approved)",
                "content_kind": "neq.permanent_leisure",
                "ends_at": f"lt.{current_iso}",
            },
            columns="id",
        )

        if not dry_run:
            self._patch_ids(
                "good_deals",
                [str(row["id"]) for row in good_deals],
                {
                    "is_active": False,
                    "source_still_available": False,
                    "availability_status": "expired",
                    "updated_at": current_iso,
                },
            )
            self._patch_ids(
                "shopping_promotions",
                [str(row["id"]) for row in promotions],
                {"is_active": False, "updated_at": current_iso},
            )
            self._patch_ids(
                "shopping_catalogs",
                [str(row["id"]) for row in catalogs],
                {"is_active": False, "updated_at": current_iso},
            )
            self._patch_ids(
                "good_deal_candidates",
                [str(row["id"]) for row in candidates],
                {"status": "expired", "updated_at": current_iso},
            )

        return ExpirationMaintenanceResult(
            dry_run=dry_run,
            good_deals=len(good_deals),
            promotions=len(promotions),
            catalogs=len(catalogs),
            candidates=len(candidates),
        )

    def list_candidates_pending_publication(self) -> list[Candidate]:
        rows = self.client.select(
            "good_deal_candidates",
            filters={
                "status": "eq.approved",
                "published_good_deal_id": "is.null",
                "order": "detected_at.asc",
            },
        )
        if not rows:
            return []

        source_ids = sorted({str(row["source_id"]) for row in rows if row.get("source_id")})
        source_map: dict[str, str] = {}
        if source_ids:
            source_rows = self.client.select(
                "good_deal_sources",
                filters={"id": f"in.({','.join(source_ids)})"},
                columns="id,slug",
            )
            source_map = {str(row["id"]): str(row["slug"]) for row in source_rows}

        candidates: list[Candidate] = []
        for row in rows:
            source_id = str(row["source_id"])
            source_slug = source_map.get(source_id)
            if not source_slug:
                continue
            candidates.append(Candidate.from_row(row, source_slug=source_slug))
        return candidates

    def _upsert(self, table: str, payload: dict[str, object], on_conflict: str) -> str | None:
        rows = self.client.upsert(table, [payload], on_conflict=on_conflict)
        return str(rows[0]["id"]) if rows else None

    def upsert_business(self, payload: dict[str, object]) -> str | None:
        return self._upsert("good_deal_businesses", payload, "slug")

    def upsert_store_location(self, payload: dict[str, object]) -> str | None:
        return self._upsert("shopping_store_locations", payload, "retailer_slug,store_name,commune")

    def upsert_product(self, payload: dict[str, object]) -> str | None:
        filters = dict(
            [
                self._null_safe_filter("normalized_name", payload.get("normalized_name")),
                self._null_safe_filter("brand", payload.get("brand")),
                self._null_safe_filter("size_label", payload.get("size_label")),
            ]
        )
        rows = self.client.select("shopping_products", filters={**filters, "limit": "1"})
        if rows:
            product_id = str(rows[0]["id"])
            self.client.patch(
                "shopping_products",
                filters={"id": f"eq.{product_id}"},
                values={**payload, "updated_at": datetime.now(timezone.utc).isoformat()},
            )
            return product_id
        rows = self.client.insert("shopping_products", [{**payload, "updated_at": datetime.now(timezone.utc).isoformat()}])
        return str(rows[0]["id"]) if rows else None

    def upsert_product_alias(self, payload: dict[str, object]) -> str | None:
        filters = dict(
            [
                self._null_safe_filter("product_id", payload.get("product_id")),
                self._null_safe_filter("normalized_alias", payload.get("normalized_alias")),
                self._null_safe_filter("retailer_slug", payload.get("retailer_slug")),
            ]
        )
        rows = self.client.select("shopping_product_aliases", filters={**filters, "limit": "1"})
        if rows:
            return str(rows[0]["id"])
        rows = self.client.insert("shopping_product_aliases", [payload])
        return str(rows[0]["id"]) if rows else None

    def upsert_catalog(self, payload: dict[str, object]) -> str | None:
        return self._upsert("shopping_catalogs", payload, "collector_source_slug,external_key")

    def upsert_promotion(self, payload: dict[str, object]) -> str | None:
        return self._upsert("shopping_promotions", payload, "collector_source_slug,external_key")

    def upsert_good_deal(self, payload: dict[str, object]) -> str | None:
        return self._upsert("good_deals", payload, "collector_source_slug,external_key")


class DryRunRepositories:
    def __init__(
        self,
        technical_repositories: RepositoryProtocol,
        transient_repositories: InMemoryRepositories | None = None,
    ) -> None:
        self.technical_repositories = technical_repositories
        self.transient_repositories = transient_repositories or InMemoryRepositories()

    def start_run(self, run_key: str, trigger_type: str, mode: str) -> None:
        self.technical_repositories.start_run(run_key, trigger_type, mode)

    def finish_run(self, summary: RunSummary) -> None:
        self.technical_repositories.finish_run(summary)

    def ensure_source(self, source: SourceDefinition) -> str:
        return self.technical_repositories.ensure_source(source)

    def get_last_snapshot_hash(self, source_slug: str) -> str | None:
        return self.technical_repositories.get_last_snapshot_hash(source_slug)

    def record_snapshot(
        self,
        source_slug: str,
        source_id: str,
        document: SourceDocument,
        changed: bool,
        status: str,
        error_message: str | None = None,
    ) -> str:
        return self.technical_repositories.record_snapshot(
            source_slug,
            source_id,
            document,
            changed,
            status,
            error_message,
        )

    def save_candidate(self, source_id: str, snapshot_id: str | None, candidate: Candidate) -> str:
        return self.transient_repositories.save_candidate(source_id, snapshot_id, candidate)

    def find_duplicate_candidate_id(self, duplicate_key: str) -> str | None:
        return self.transient_repositories.find_duplicate_candidate_id(duplicate_key)

    def find_saved_candidate(self, source_slug: str, external_key: str) -> Candidate | None:
        return self.transient_repositories.find_saved_candidate(source_slug, external_key)

    def mark_candidate(self, candidate: Candidate, *, status: str, published_good_deal_id: str | None = None) -> None:
        self.transient_repositories.mark_candidate(
            candidate,
            status=status,
            published_good_deal_id=published_good_deal_id,
        )

    def expire_stale_records(self, *, dry_run: bool, now: datetime | None = None) -> ExpirationMaintenanceResult:
        return self.technical_repositories.expire_stale_records(dry_run=dry_run, now=now)

    def list_candidates_pending_publication(self) -> list[Candidate]:
        return self.technical_repositories.list_candidates_pending_publication()

    def upsert_business(self, payload: dict[str, object]) -> str | None:
        return self.transient_repositories.upsert_business(payload)

    def upsert_store_location(self, payload: dict[str, object]) -> str | None:
        return self.transient_repositories.upsert_store_location(payload)

    def upsert_product(self, payload: dict[str, object]) -> str | None:
        return self.transient_repositories.upsert_product(payload)

    def upsert_product_alias(self, payload: dict[str, object]) -> str | None:
        return self.transient_repositories.upsert_product_alias(payload)

    def upsert_catalog(self, payload: dict[str, object]) -> str | None:
        return self.transient_repositories.upsert_catalog(payload)

    def upsert_promotion(self, payload: dict[str, object]) -> str | None:
        return self.transient_repositories.upsert_promotion(payload)

    def upsert_good_deal(self, payload: dict[str, object]) -> str | None:
        return self.transient_repositories.upsert_good_deal(payload)
