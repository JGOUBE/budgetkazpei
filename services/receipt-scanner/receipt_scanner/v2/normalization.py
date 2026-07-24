from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


MONEY_RE = re.compile(r"(?<!\d)(\d{1,5}[.,]\d{2})(?!\d)")
NEGATIVE_MONEY_RE = re.compile(
    r"(?<!\d)(?:-|−|–)\s*(\d{1,5}[.,]\d{2})(?!\d)"
)
PERCENT_RE = re.compile(
    r"\b(?P<percent>\d{1,2}(?:[.,]\d+)?)\s*%",
    re.IGNORECASE,
)
MULTIBUY_RE = re.compile(
    r"(?P<quantity>\d{1,3})\s*[xX×]\s*"
    r"(?P<unit_price>\d+[.,]\d{2})\s*(?:€|EUR)?",
    re.IGNORECASE,
)
MULTIBUY_QUANTITY_RE = re.compile(
    r"(?P<quantity>\d{1,3})\s*[xX×]",
    re.IGNORECASE,
)
WEIGHT_RE = re.compile(
    r"(?P<weight>\d+[.,]\d+)\s*k(?:g|9|q|6|o)\s*[xX×]\s*"
    r"(?P<price_per_kg>\d+[.,]\d{2})\s*(?:€|EUR)?\s*/?\s*"
    r"k(?:g|9|q|6|o)",
    re.IGNORECASE,
)
WEIGHT_VALUE_RE = re.compile(
    r"(?P<weight>\d+[.,]\d{2,3})\s*k(?:g|9|q|6|o)\b",
    re.IGNORECASE,
)
PRICE_PER_KG_HINT_RE = re.compile(
    r"(?:€|EUR)?\s*/\s*k(?:g|9|q|6|o)\b|"
    r"(?:€|EUR)\s*k(?:g|9|q|6|o)\b",
    re.IGNORECASE,
)
DATE_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")
TIME_RE = re.compile(r"\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b")
PHONE_RE = re.compile(r"(?:\d{2}[.\s-]){4}\d{2}")
PHONE_LABEL_RE = re.compile(r"^\s*TE[L1I]\s*[:.]", re.IGNORECASE)
BARCODE_RE = re.compile(r"(?<!\d)(?:\(\d\))?\s*\d{8,14}(?!\d)")
PRODUCT_UNIT_HINT_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:KG|G|GR|ML|CL|L)\b|\bX\s*\d+\b",
    re.IGNORECASE,
)
LINE_COUNT_PATTERNS = (
    re.compile(
        r"\bN[A-Z0-9]{1,3}BRE\s+(?:DE\s+)?LIGNES?\s+"
        r"D['’]?\s*ARTICLES?\s*[:=\[\(]?\s*(\d{1,3})\b",
        re.IGNORECASE,
    ),
)

COUNT_PATTERNS = (
    re.compile(
        r"\bTOTAL\s*[\[(]?\s*(\d{1,3})\s*[\])\]]?\s+ARTICLES?\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:TOTAL|NOMBRE|NB|NBR)\s*(?:DE\s+)?"
        r"(?:LIGNES?\s+D['’]?\s*)?ARTICLES?\s*[:=\[\(]?\s*(\d{1,3})\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:TOTAL|NOMBRE|NB|NBR)\s*[:=]?\s*(\d{1,3})\s+ARTICLES?\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(\d{1,3})\s+ARTICLES?\b", re.IGNORECASE),
)


def fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    normalized = "".join(
        char for char in normalized
        if not unicodedata.combining(char)
    )
    normalized = normalized.upper().replace("|", " ")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def compact(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", fold(value))


def decimal_money(value: str | int | float | Decimal | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = (
        str(value)
        .strip()
        .replace("€", "")
        .replace("EUR", "")
        .replace(" ", "")
        .replace(",", ".")
    )
    try:
        return Decimal(cleaned).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
    except InvalidOperation:
        return None


def money_values(value: str) -> list[Decimal]:
    parsed: list[Decimal] = []
    for match in MONEY_RE.finditer(value):
        amount = decimal_money(match.group(1))
        if amount is not None:
            parsed.append(amount)
    return parsed


def negative_money_value(value: str) -> Decimal | None:
    """Return the absolute value of an explicitly negative amount."""
    match = NEGATIVE_MONEY_RE.search(value)
    if match is None:
        return None
    return decimal_money(match.group(1))


def unsigned_discount_amount(value: str) -> Decimal | None:
    """Read an amount whose minus sign may have been lost by OCR.

    This helper must only be used when a separate structural proof already
    identifies the row as a discount, for example an immediately preceding
    percentage/discount label inside the same product block.
    """
    values = money_values(value)
    return values[-1] if values else None


def semantic_text_without_money(value: str) -> str:
    """Remove amounts and currency markers before semantic classification."""
    cleaned = NEGATIVE_MONEY_RE.sub(" ", value)
    cleaned = MONEY_RE.sub(" ", cleaned)
    cleaned = re.sub(
        r"\b(?:EUR|EURO|EUROS)\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"[^A-Za-zÀ-ÿ0-9%]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def declared_count(value: str) -> int | None:
    for pattern in COUNT_PATTERNS:
        match = pattern.search(value)
        if match is not None:
            return int(match.group(1))
    return None


def line_count_summary(value: str) -> int | None:
    """Return the printed number of product lines, not article quantity.

    This is intentionally separate from declared_count because a receipt can
    contain 20 product lines but 24 articles after multi-quantity purchases.
    """
    folded = fold(value)
    for pattern in LINE_COUNT_PATTERNS:
        match = pattern.search(folded)
        if match is not None:
            return int(match.group(1))
    return None


def clean_product_name(value: str) -> str:
    cleaned = value.replace("|", " ")
    cleaned = BARCODE_RE.sub(" ", cleaned)
    cleaned = MONEY_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\b(?:EUR|EURO|EUROS)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\s*[*•·]+\s*", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:;,")
    return cleaned


def word_count(value: str) -> int:
    return len(re.findall(r"[A-ZÀ-ÖØ-Þ0-9]+", fold(value)))


def has_letters(value: str) -> bool:
    return bool(re.search(r"[A-Za-zÀ-ÿ]", value))


def line_is_mostly_upper(value: str) -> bool:
    letters = [char for char in value if char.isalpha()]
    if not letters:
        return False
    upper = sum(char.isupper() for char in letters)
    return upper / len(letters) >= 0.85


def looks_like_phone_line(value: str) -> bool:
    return bool(PHONE_RE.search(value) or PHONE_LABEL_RE.search(value))




def looks_like_multibuy_detail(value: str) -> bool:
    """Return True only for a real quantity × unit-price detail row.

    Product pack sizes such as ``6X1,25L`` must not be interpreted as a
    purchase of six units at 1.25 EUR. Real multibuy rows begin with the
    quantity expression or carry an explicit currency marker.
    """
    direct = MULTIBUY_RE.search(value)
    loose = MULTIBUY_QUANTITY_RE.search(value)
    if direct is None and loose is None:
        return False

    match = direct or loose
    assert match is not None

    prefix = value[:match.start()]
    starts_as_detail = not bool(re.search(r"[A-Za-zÀ-ÿ]", prefix))
    has_currency = bool(
        re.search(r"(?:€|\bEUR\b)", value, re.IGNORECASE)
    )
    if not starts_as_detail:
        return False

    outside = (value[:match.start()] + " " + value[match.end():])
    outside = re.sub(r"\bEUR\b", " ", outside, flags=re.IGNORECASE)
    if re.search(r"[A-Za-zÀ-ÿ]", outside):
        return False

    if direct is not None:
        suffix = value[direct.end():].lstrip()
        if (
            not has_currency
            and re.match(
                r"^(?:KG|G|GR|ML|CL|L)\b",
                suffix,
                re.IGNORECASE,
            )
        ):
            return False

    return True


def looks_like_loose_weight_detail(value: str) -> bool:
    normalized = fold(value)
    return bool(
        WEIGHT_VALUE_RE.search(value)
        and re.search(r"[X×]", normalized)
        and (
            PRICE_PER_KG_HINT_RE.search(value)
            or "/KG" in normalized
            or "EUR/KG" in normalized
        )
    )
