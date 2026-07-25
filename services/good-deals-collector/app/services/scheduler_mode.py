from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo


VALID_MODES = {"full", "shopping", "events", "permanent", "dry-run"}


def normalize_mode(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in VALID_MODES:
        return "full"
    return cleaned


def is_monthly_deep_check(now: datetime | None = None, *, timezone_name: str = "Indian/Reunion") -> bool:
    current = now.astimezone(ZoneInfo(timezone_name)) if now else datetime.now(ZoneInfo(timezone_name))
    return current.day == 1


def source_allowed_in_mode(content_family: str, mode: str) -> bool:
    normalized_mode = normalize_mode(mode)
    if normalized_mode in {"full", "dry-run"}:
        return True
    if normalized_mode == "shopping":
        return content_family == "shopping"
    if normalized_mode == "events":
        return content_family == "event"
    if normalized_mode == "permanent":
        return content_family == "permanent_leisure"
    return True
