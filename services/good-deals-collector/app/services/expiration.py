from __future__ import annotations

from datetime import datetime, timedelta, timezone
from app.models.candidate import Candidate
from app.services.catalog_period import publication_period


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_expired(candidate: Candidate, *, now: datetime | None = None) -> bool:
    current = now or datetime.now(timezone.utc)
    if candidate.content_kind == "permanent_leisure":
        return False
    _, inclusive_end = publication_period(candidate)
    ends_at = _as_utc(inclusive_end)
    return bool(ends_at and ends_at < current)


def next_check_at(content_kind: str, *, now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if content_kind == "permanent_leisure":
        return current + timedelta(days=30)
    if content_kind == "event":
        return current + timedelta(days=14)
    return current + timedelta(days=7)
