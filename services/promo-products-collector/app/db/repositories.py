from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.services.page_fingerprint import PageSnapshotRecord

from .supabase_client import SupabaseAdminClient


class PageSnapshotRepository(Protocol):
    def resolve_catalog_id(self, *, collector_source_slug: str, catalog_external_key: str) -> str | None: ...
    def get_page_snapshot(self, *, catalog_id: str, page_number: int) -> PageSnapshotRecord | None: ...
    def upsert_page_snapshot(self, snapshot: PageSnapshotRecord) -> None: ...


@dataclass
class InMemoryPageSnapshotRepository:
    catalog_ids: dict[tuple[str, str], str] = field(default_factory=dict)
    page_snapshots: dict[tuple[str, int], PageSnapshotRecord] = field(default_factory=dict)
    upserts: list[PageSnapshotRecord] = field(default_factory=list)

    def resolve_catalog_id(self, *, collector_source_slug: str, catalog_external_key: str) -> str | None:
        return self.catalog_ids.get((collector_source_slug, catalog_external_key))

    def get_page_snapshot(self, *, catalog_id: str, page_number: int) -> PageSnapshotRecord | None:
        return self.page_snapshots.get((catalog_id, page_number))

    def upsert_page_snapshot(self, snapshot: PageSnapshotRecord) -> None:
        self.page_snapshots[(snapshot.catalog_id, snapshot.page_number)] = snapshot
        self.upserts.append(snapshot)


class SupabasePageSnapshotRepository:
    def __init__(self, client: SupabaseAdminClient) -> None:
        self.client = client

    def resolve_catalog_id(self, *, collector_source_slug: str, catalog_external_key: str) -> str | None:
        rows = self.client.select(
            "shopping_catalogs",
            filters={
                "collector_source_slug": f"eq.{collector_source_slug}",
                "external_key": f"eq.{catalog_external_key}",
                "limit": "1",
            },
            columns="id",
        )
        return str(rows[0]["id"]) if rows else None

    def get_page_snapshot(self, *, catalog_id: str, page_number: int) -> PageSnapshotRecord | None:
        rows = self.client.select(
            "shopping_catalog_page_snapshots",
            filters={"catalog_id": f"eq.{catalog_id}", "page_number": f"eq.{page_number}", "limit": "1"},
        )
        if not rows:
            return None
        row = rows[0]
        return PageSnapshotRecord(
            catalog_id=str(row["catalog_id"]),
            page_number=int(row["page_number"]),
            asset_url=str(row["asset_url"]),
            asset_sha256=str(row["asset_sha256"]),
            asset_content_type=row.get("asset_content_type"),
            asset_size_bytes=int(row["asset_size_bytes"]),
            source_last_modified=row.get("source_last_modified"),
            extraction_status=str(row["extraction_status"]),
            extraction_version=str(row.get("extraction_version") or ""),
            first_seen_at=_parse_datetime(str(row["first_seen_at"])),
            last_seen_at=_parse_datetime(str(row["last_seen_at"])),
            extracted_at=_parse_datetime(row.get("extracted_at")),
            purge_after=_parse_datetime(row.get("purge_after")),
        )

    def upsert_page_snapshot(self, snapshot: PageSnapshotRecord) -> None:
        self.client.upsert(
            "shopping_catalog_page_snapshots",
            [
                {
                    "catalog_id": snapshot.catalog_id,
                    "page_number": snapshot.page_number,
                    "asset_url": snapshot.asset_url,
                    "asset_sha256": snapshot.asset_sha256,
                    "asset_content_type": snapshot.asset_content_type,
                    "asset_size_bytes": snapshot.asset_size_bytes,
                    "source_last_modified": snapshot.source_last_modified,
                    "extraction_status": snapshot.extraction_status,
                    "extraction_version": snapshot.extraction_version,
                    "first_seen_at": snapshot.first_seen_at.isoformat(),
                    "last_seen_at": snapshot.last_seen_at.isoformat(),
                    "extracted_at": snapshot.extracted_at.isoformat() if snapshot.extracted_at else None,
                    "purge_after": snapshot.purge_after.isoformat() if snapshot.purge_after else None,
                }
            ],
            on_conflict="catalog_id,page_number",
        )


def build_repository(*, supabase_url: str | None, supabase_service_role_key: str | None) -> PageSnapshotRepository:
    if not supabase_url or not supabase_service_role_key:
        return InMemoryPageSnapshotRepository()
    return SupabasePageSnapshotRepository(SupabaseAdminClient(supabase_url, supabase_service_role_key))


def _parse_datetime(value: str | None) -> object | None:
    if not value:
        return None
    from datetime import datetime

    return datetime.fromisoformat(value.replace("Z", "+00:00"))
