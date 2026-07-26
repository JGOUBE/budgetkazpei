from __future__ import annotations

from datetime import datetime, timedelta, timezone
from app.models.candidate import Candidate


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
    ends_at = _as_utc(candidate.ends_at)
    return bool(ends_at and ends_at < current)


def next_check_at(content_kind: str, *, now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if content_kind == "permanent_leisure":
        return current + timedelta(days=30)
    if content_kind == "event":
        return current + timedelta(days=14)
    return current + timedelta(days=7)
