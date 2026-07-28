from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class PageAssetMetadata:
    page_number: int
    asset_url: str
    asset_sha256: str
    asset_content_type: str | None
    asset_size_bytes: int
    source_last_modified: str | None


@dataclass(frozen=True)
class PageSnapshotRecord:
    catalog_id: str
    page_number: int
    asset_url: str
    asset_sha256: str
    asset_content_type: str | None
    asset_size_bytes: int
    source_last_modified: str | None
    extraction_status: str
    extraction_version: str
    first_seen_at: datetime
    last_seen_at: datetime
    extracted_at: datetime | None
    purge_after: datetime | None


@dataclass(frozen=True)
class PageDecision:
    decision: str
    snapshot: PageSnapshotRecord


def plan_page_snapshot(
    *,
    catalog_id: str,
    current: PageAssetMetadata,
    previous: PageSnapshotRecord | None,
    extraction_version: str,
    now: datetime,
) -> PageDecision:
    if previous is None:
        return PageDecision(
            decision="new",
            snapshot=PageSnapshotRecord(
                catalog_id=catalog_id,
                page_number=current.page_number,
                asset_url=current.asset_url,
                asset_sha256=current.asset_sha256,
                asset_content_type=current.asset_content_type,
                asset_size_bytes=current.asset_size_bytes,
                source_last_modified=current.source_last_modified,
                extraction_status="discovered",
                extraction_version=extraction_version,
                first_seen_at=now,
                last_seen_at=now,
                extracted_at=None,
                purge_after=None,
            ),
        )

    if previous.asset_sha256 == current.asset_sha256:
        return PageDecision(
            decision="unchanged",
            snapshot=PageSnapshotRecord(
                catalog_id=catalog_id,
                page_number=current.page_number,
                asset_url=current.asset_url,
                asset_sha256=current.asset_sha256,
                asset_content_type=current.asset_content_type,
                asset_size_bytes=current.asset_size_bytes,
                source_last_modified=current.source_last_modified,
                extraction_status="unchanged",
                extraction_version=extraction_version,
                first_seen_at=previous.first_seen_at,
                last_seen_at=now,
                extracted_at=previous.extracted_at,
                purge_after=previous.purge_after,
            ),
        )

    return PageDecision(
        decision="changed",
        snapshot=PageSnapshotRecord(
            catalog_id=catalog_id,
            page_number=current.page_number,
            asset_url=current.asset_url,
            asset_sha256=current.asset_sha256,
            asset_content_type=current.asset_content_type,
            asset_size_bytes=current.asset_size_bytes,
            source_last_modified=current.source_last_modified,
            extraction_status="pending_extraction",
            extraction_version=extraction_version,
            first_seen_at=previous.first_seen_at,
            last_seen_at=now,
            extracted_at=None,
            purge_after=None,
        ),
    )
