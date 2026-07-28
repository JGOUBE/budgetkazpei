from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urljoin, urlsplit, urlunsplit


ELECLERC_LINK_RE = re.compile(
    r'<li>\s*<a href="([^"]+)"[^>]*target="_blank"[^>]*title="([^"]*Catalogue E\.Leclerc[^"]*)"[^>]*>(.*?)</a>\s*</li>',
    flags=re.IGNORECASE | re.DOTALL,
)

FRENCH_MONTHS = {
    "janvier": 1,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "décembre": 12,
}


@dataclass(frozen=True)
class CatalogReference:
    catalog_slug: str
    title: str
    viewer_url: str
    period_text: str
    starts_at: datetime | None
    ends_at: datetime | None

    @property
    def external_key_suffix(self) -> str:
        return self.catalog_slug.lower()


def discover_catalogs(html_text: str, base_url: str, allowed_host: str) -> list[CatalogReference]:
    entries: list[CatalogReference] = []
    seen_slugs: set[str] = set()
    for match in ELECLERC_LINK_RE.finditer(_strip_html_comments(html_text)):
        href, title_attr, label_html = match.groups()
        canonical_url = _normalize_url(href, base_url)
        if not canonical_url:
            continue
        split = urlsplit(canonical_url)
        if split.hostname and split.hostname.lower() != allowed_host.lower() and split.hostname.lower() != f"www.{allowed_host.lower()}":
            continue
        if "/public/catalogues/" not in split.path.lower():
            continue
        catalog_slug = split.path.rstrip("/").rsplit("/", 1)[-1]
        if not catalog_slug or catalog_slug in seen_slugs:
            continue
        seen_slugs.add(catalog_slug)
        label = _clean_text(label_html)
        period_text = _clean_text(title_attr)
        starts_at, ends_at = _parse_french_date_range(period_text, default_year=2026)
        entries.append(
            CatalogReference(
                catalog_slug=catalog_slug,
                title=label,
                viewer_url=canonical_url,
                period_text=period_text,
                starts_at=starts_at,
                ends_at=ends_at,
            )
        )
    return entries


def _normalize_url(value: str, base_url: str) -> str | None:
    if not value:
        return None
    absolute = urljoin(base_url, html.unescape(value).strip())
    split = urlsplit(absolute)
    path = re.sub(r"/{2,}", "/", split.path or "/")
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit((split.scheme.lower(), split.netloc.lower(), path, split.query, ""))


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    without_tags = re.sub(r"(?is)<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(without_tags)).strip()


def _strip_html_comments(value: str) -> str:
    return re.sub(r"(?is)<!--.*?-->", "", value)


def _normalize_text(value: str) -> str:
    lowered = "".join(
        ch for ch in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(ch)
    )
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", lowered)).strip()


def _parse_french_date(value: str, *, default_year: int | None = None) -> datetime | None:
    cleaned = _normalize_text(value)
    match = re.search(r"(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?", cleaned)
    if not match:
        return None
    day = int(match.group(1))
    month = FRENCH_MONTHS.get(match.group(2))
    year = int(match.group(3)) if match.group(3) else default_year
    if month is None or year is None:
        return None
    return datetime(year, month, day)


def _parse_french_date_range(value: str, *, default_year: int | None = None) -> tuple[datetime | None, datetime | None]:
    compact = re.sub(r"\s+", " ", html.unescape(value or "")).strip()
    weekday = r"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)"
    textual = re.search(
        rf"du\s+(?:{weekday}\s+)?(\d{{1,2}}\s+[A-Za-zéèêàûùïîôâç]+(?:\s+\d{{4}})?)\s+au\s+(?:{weekday}\s+)?(\d{{1,2}}\s+[A-Za-zéèêàûùïîôâç]+(?:\s+\d{{4}})?)",
        compact,
        flags=re.IGNORECASE,
    )
    if not textual:
        return None, None
    end = _parse_french_date(textual.group(2), default_year=default_year)
    start_default_year = end.year if end is not None else default_year
    start = _parse_french_date(textual.group(1), default_year=start_default_year)
    return start, end
