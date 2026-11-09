from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.candidate import Candidate
from app.services.normalization import normalize_text

# La Reunion has no daylight saving time.
REUNION_TZ = timezone(timedelta(hours=4))


def is_catalogue(candidate: Candidate) -> bool:
    tags = {normalize_text(tag) for tag in candidate.tags if tag}
    return candidate.content_kind == "promotion" and bool(tags & {"catalogue", "catalog"})


def publication_period(candidate: Candidate) -> tuple[datetime | None, datetime | None]:
    """Use inclusive local calendar days for date-only catalogues.

    Parsers produce naive dates for official leaflet periods. Keep event and
    price-promotion timestamps unchanged; do not reinterpret aware dates.
    """
    starts_at, ends_at = candidate.starts_at, candidate.ends_at
    if not is_catalogue(candidate):
        return starts_at, ends_at
    if starts_at is not None and starts_at.tzinfo is None:
        starts_at = starts_at.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=REUNION_TZ)
    if ends_at is not None and ends_at.tzinfo is None:
        ends_at = ends_at.replace(hour=23, minute=59, second=59, microsecond=0, tzinfo=REUNION_TZ)
    return starts_at, ends_at
