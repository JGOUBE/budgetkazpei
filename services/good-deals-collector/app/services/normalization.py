from __future__ import annotations

import html
import re
import unicodedata
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

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

UNIT_REPLACEMENTS = {
    "litres": "l",
    "litre": "l",
    "cl": "cl",
    "ml": "ml",
    "grammes": "g",
    "gramme": "g",
    "kilogrammes": "kg",
    "kilogramme": "kg",
}

IGNORED_QUERY_KEYS = {
    "cache",
    "cb",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "nonce",
    "phpsessid",
    "session",
    "sessionid",
    "timestamp",
}


def strip_accents(value: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", value) if not unicodedata.combining(ch))


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = strip_accents(value).lower()
    normalized = normalized.replace("×", "x")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_unit(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = normalize_text(value)
    return UNIT_REPLACEMENTS.get(cleaned, cleaned)


def normalize_size_label(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = strip_accents(value).lower().replace("×", "x")
    cleaned = re.sub(r"\s+", "", cleaned)
    cleaned = cleaned.replace(",", ".")
    cleaned = cleaned.replace("litres", "l").replace("litre", "l")
    return cleaned


def normalize_commune(value: str | None) -> str | None:
    if not value:
        return None
    text = " ".join(part.capitalize() for part in normalize_text(value).split())
    return text.replace("St ", "Saint-").replace("Ste ", "Sainte-")


def parse_decimal(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = value.replace("\u202f", " ").replace("€", "")
    cleaned = re.sub(r"[^0-9,.\-]", "", cleaned)
    if cleaned.count(",") == 1 and cleaned.count(".") == 0:
        cleaned = cleaned.replace(",", ".")
    if cleaned.count(".") > 1:
        head, tail = cleaned.rsplit(".", 1)
        cleaned = head.replace(".", "") + "." + tail
    if cleaned == "":
        return None
    return round(float(cleaned), 2)


def parse_french_date(value: str, *, default_year: int | None = None) -> datetime | None:
    if not value:
        return None
    cleaned = normalize_text(value)
    match = re.search(r"(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?", cleaned)
    if not match:
        return None
    day = int(match.group(1))
    month = FRENCH_MONTHS.get(match.group(2))
    year = int(match.group(3)) if match.group(3) else default_year
    if month is None or year is None:
        return None
    return datetime(year, month, day)


def parse_french_numeric_date(value: str | None) -> datetime | None:
    if not value:
        return None
    match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", value)
    if not match:
        return None
    return datetime(int(match.group(3)), int(match.group(2)), int(match.group(1)))


def parse_french_date_range(value: str | None, *, default_year: int | None = None) -> tuple[datetime | None, datetime | None]:
    if not value:
        return None, None
    compact = re.sub(r"\s+", " ", html.unescape(value)).strip()
    numeric = re.search(r"du\s+(\d{1,2}/\d{1,2}/\d{4})\s+au\s+(\d{1,2}/\d{1,2}/\d{4})", compact, flags=re.IGNORECASE)
    if numeric:
        return parse_french_numeric_date(numeric.group(1)), parse_french_numeric_date(numeric.group(2))

    weekday = r"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)"
    textual = re.search(
        rf"du\s+(?:{weekday}\s+)?(\d{{1,2}}\s+[A-Za-z{chr(233)}{chr(232)}{chr(234)}{chr(224)}{chr(251)}{chr(249)}{chr(238)}{chr(239)}{chr(244)}{chr(226)}{chr(231)}]+(?:\s+\d{{4}})?)\s+au\s+(?:{weekday}\s+)?(\d{{1,2}}\s+[A-Za-z{chr(233)}{chr(232)}{chr(234)}{chr(224)}{chr(251)}{chr(249)}{chr(238)}{chr(239)}{chr(244)}{chr(226)}{chr(231)}]+(?:\s+\d{{4}})?)",
        compact,
        flags=re.IGNORECASE,
    )
    if not textual:
        return None, None

    end = parse_french_date(textual.group(2), default_year=default_year)
    start_default_year = end.year if end is not None else default_year
    start = parse_french_date(textual.group(1), default_year=start_default_year)
    return start, end


def normalize_url(value: str | None, base_url: str) -> str | None:
    if not value:
        return None
    absolute = urljoin(base_url, html.unescape(value).strip())
    split = urlsplit(absolute)
    path = re.sub(r"/{2,}", "/", split.path or "/")
    if path != "/":
        path = path.rstrip("/")

    query_items: list[tuple[str, str]] = []
    for key, raw_value in parse_qsl(split.query, keep_blank_values=False):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in IGNORED_QUERY_KEYS:
            continue
        if lowered.endswith("_hsenc") or lowered.endswith("_hsmi"):
            continue
        if lowered in {"ver", "version"} and re.fullmatch(r"[0-9a-fA-F]{6,}|[0-9]{6,}", raw_value):
            continue
        if lowered in {"token", "sig", "signature"} and len(raw_value) > 10:
            continue
        query_items.append((key, raw_value))

    query_items.sort(key=lambda item: (item[0].lower(), item[1]))
    query = urlencode(query_items, doseq=True)
    return urlunsplit((split.scheme.lower(), split.netloc.lower(), path, query, ""))


def compact_excerpt(value: str | None, limit: int = 280) -> str | None:
    if not value:
        return None
    trimmed = re.sub(r"\s+", " ", value).strip()
    return trimmed[:limit]
