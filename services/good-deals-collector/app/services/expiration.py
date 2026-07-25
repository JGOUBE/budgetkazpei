from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.candidate import Candidate


def is_expired(candidate: Candidate, *, now: datetime | None = None) -> bool:
    current = now or datetime.now(timezone.utc)
    if candidate.content_kind == "permanent_leisure":
        return False
    return bool(candidate.ends_at and candidate.ends_at.replace(tzinfo=timezone.utc) < current)


def next_check_at(content_kind: str, *, now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if content_kind == "permanent_leisure":
        return current + timedelta(days=30)
    if content_kind == "event":
        return current + timedelta(days=14)
    return current + timedelta(days=7)
