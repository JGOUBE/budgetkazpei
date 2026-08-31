from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


UNIT_ALIASES = {
    "kg": "kg",
    "g": "g",
    "gr": "g",
    "mg": "mg",
    "l": "l",
    "cl": "cl",
    "ml": "ml",
}

MULTIPACK_RE = re.compile(
    r"(?P<count>\d+)\s*[xX]\s*(?P<value>\d+(?:[.,]\d+)?)\s*(?P<unit>kg|g|gr|mg|l|cl|ml)\b",
    flags=re.IGNORECASE,
)
SIMPLE_QUANTITY_RE = re.compile(
    r"(?P<value>\d+(?:[.,]\d+)?)\s*(?P<unit>kg|g|gr|mg|l|cl|ml)\b",
    flags=re.IGNORECASE,
)
UNIT_PRICE_RE = re.compile(
    r"Soit\s*(?P<value>\d+(?:[.,]\d+)?)\s*[€EUR ]+\s*/\s*(?P<unit>Kg|G|L|Cl|Ml)",
    flags=re.IGNORECASE,
)
PACKAGE_COUNT_RE = re.compile(
    r"(?P<count>\d+)\s+(?P<unit>rasoirs?|lingettes?|blocs?|sachets?|pi[eè]ces?|rouleaux?|"
    r"doses?|capsules?|canettes?|bouteilles?|berlingots?|tablettes?|pastilles?|recharges?)\b",
    flags=re.IGNORECASE,
)
PROMOTIONAL_QUANTITY_RE = re.compile(
    r"(?:\+|gratuit|offert|remise|promo|promotion)",
    flags=re.IGNORECASE,
)


@dataclass(frozen=True)
class PackageNormalization:
    package_format: str | None
    quantity_value: float | None
    quantity_unit: str | None
    pack_count: int | None
    total_quantity_value: float | None
    total_quantity_unit: str | None


def normalize_product_name(value: str | None) -> str | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None
    return cleaned


def normalize_lookup_key(value: str | None) -> str:
    cleaned = clean_text(value)
    if not cleaned:
        return ""
    ascii_value = (
        unicodedata.normalize("NFD", cleaned)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return re.sub(r"[^a-z0-9]+", " ", ascii_value).strip()


def clean_text(value: str | None) -> str:
    raw = str(value or "")
    raw = raw.replace("\xa0", " ")
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip()


def parse_price(value: str | None) -> float | None:
    if value is None:
        return None
    cleaned = clean_text(value).replace("€", "").replace("eur", "").replace("EUR", "")
    cleaned = cleaned.replace(" ", "").replace(",", ".")
    match = re.search(r"\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    try:
        return round(float(match.group(0)), 2)
    except ValueError:
        return None


def parse_package_format(value: str | None) -> PackageNormalization:
    package_format = _canonical_package_text(value)
    if not package_format:
        return PackageNormalization(None, None, None, None, None, None)

    multipack_match = MULTIPACK_RE.search(package_format)
    if multipack_match:
        count = int(multipack_match.group("count"))
        quantity_value = _parse_float(multipack_match.group("value"))
        quantity_unit = _normalize_unit(multipack_match.group("unit"))
        total_quantity_value = round(count * quantity_value, 3) if quantity_value is not None else None
        return PackageNormalization(
            package_format=package_format,
            quantity_value=quantity_value,
            quantity_unit=quantity_unit,
            pack_count=count,
            total_quantity_value=total_quantity_value,
            total_quantity_unit=quantity_unit,
        )

    simple_match = SIMPLE_QUANTITY_RE.search(package_format)
    if simple_match:
        quantity_value = _parse_float(simple_match.group("value"))
        quantity_unit = _normalize_unit(simple_match.group("unit"))
        return PackageNormalization(
            package_format=package_format,
            quantity_value=quantity_value,
            quantity_unit=quantity_unit,
            pack_count=None,
            total_quantity_value=quantity_value,
            total_quantity_unit=quantity_unit,
        )

    return PackageNormalization(package_format, None, None, None, None, None)


def select_package_format(
    *,
    card_product_content: str | None,
    detail_package_format: str | None,
    product_label: str | None,
) -> tuple[str | None, str | None]:
    """Choose a product package from stable, product-scoped evidence only."""
    for source, value in (
        ("card_product_content", card_product_content),
        ("detail_product_content", detail_package_format),
    ):
        candidate = _canonical_package_text(value)
        if (
            candidate
            and not PROMOTIONAL_QUANTITY_RE.search(candidate)
            and _contains_package_signal(candidate)
        ):
            return candidate, source

    label_package = _package_count_from_label(product_label)
    if label_package:
        return label_package, "product_label_count"
    return None, None


def parse_unit_price(value: str | None) -> tuple[float | None, str | None]:
    cleaned = clean_text(value)
    if not cleaned:
        return None, None
    match = UNIT_PRICE_RE.search(cleaned)
    if not match:
        return None, None
    return _parse_float(match.group("value")), _normalize_unit(match.group("unit"))


def build_duplicate_key(
    *,
    store_slug: str,
    source_product_id: str | None = None,
    product_url: str | None,
    normalized_product_name: str | None,
    brand: str | None,
    package_format: str | None,
) -> str:
    if source_product_id:
        return f"{store_slug.strip().lower()}|source-id:{source_product_id.strip().lower()}"
    if product_url:
        return f"{store_slug}|{product_url.strip().lower()}"
    return "|".join(
        [
            store_slug.strip().lower(),
            normalize_lookup_key(normalized_product_name),
            normalize_lookup_key(brand),
            normalize_lookup_key(package_format),
        ]
    )


def _parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value.replace(",", ".")), 3)
    except ValueError:
        return None


def _normalize_unit(value: str | None) -> str | None:
    if value is None:
        return None
    return UNIT_ALIASES.get(value.strip().lower())


def _canonical_package_text(value: str | None) -> str | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None
    cleaned = re.sub(r"^Contenu\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.split(r"\s+(?:[-–—]\s*)?Soit\b", cleaned, maxsplit=1, flags=re.IGNORECASE)[0]
    return clean_text(cleaned) or None


def _contains_package_signal(value: str) -> bool:
    return bool(
        MULTIPACK_RE.search(value)
        or SIMPLE_QUANTITY_RE.search(value)
        or PACKAGE_COUNT_RE.search(value)
    )


def _package_count_from_label(value: str | None) -> str | None:
    cleaned = clean_text(value)
    if not cleaned or PROMOTIONAL_QUANTITY_RE.search(cleaned):
        return None
    matches = list(PACKAGE_COUNT_RE.finditer(cleaned))
    if not matches:
        return None
    match = matches[-1]
    if clean_text(cleaned[match.end():]).strip("-–—,.;:() "):
        return None
    return f"{int(match.group('count'))} {match.group('unit').lower()}"
