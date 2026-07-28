from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from app.collectors.eleclerc_reunion import CatalogReference
from app.extractors.catalog_page_regions import PageRegion
from app.models.promotion_candidate import PromotionCandidate


MONEY_RE = re.compile(r"(?<!\d)(\d{1,3}(?:[ .]\d{3})*[,.]\d{2})(?!\d)")
PERCENT_RE = re.compile(r"(?<!\d)(\d{1,3})\s*%")
PACKAGE_RE = re.compile(
    r"\b(?:\d+\s*[xX]\s*)?\d+(?:[,.]\d+)?\s*(?:kg|g|mg|l|cl|ml|litre|litres)\b",
    flags=re.IGNORECASE,
)
UNIT_PRICE_RE = re.compile(
    r"(\d{1,3}(?:[ .]\d{3})*[,.]\d{2})\s*(?:/\s*|le\s+|la\s+)?(kg|g|l|cl|ml|litre|litres)",
    flags=re.IGNORECASE,
)
KEYWORD_LOYALTY = ("ticket e leclerc", "ticket e.leclerc", "cagnotte", "carte e.leclerc", "carte e leclerc")
KEYWORD_SECOND = ("2e", "2eme", "2ème", "deuxieme", "deuxième")
KEYWORD_MULTI = ("3 pour", "2 pour", "par 2", "par 3", "lot de", "x2", "x3", "panachage")
KEYWORD_FREE = ("offert", "gratuite", "gratuit")
KEYWORD_STARTING = ("a partir", "à partir")
KEYWORD_ORIGINAL = ("au lieu", "ancien prix", "prix de reference", "prix conseillé", "prix barre")
KEYWORD_CONDITIONS = ("dans la limite", "voir modalités", "voir modalites", "selon magasins", "panachage")


@dataclass(frozen=True)
class MoneyMention:
    amount: float
    line_index: int
    role: str
    raw_text: str


def extract_promotion_candidates(
    regions: Iterable[PageRegion],
    *,
    catalog: CatalogReference,
) -> list[PromotionCandidate]:
    return [
        _extract_candidate(region, catalog=catalog)
        for region in regions
    ]


def _extract_candidate(region: PageRegion, *, catalog: CatalogReference) -> PromotionCandidate:
    lines = [line.text.strip() for line in region.lines if line.text.strip()]
    raw_text = "\n".join(lines)
    normalized_lines = [_normalize_text(line) for line in lines]
    price_mentions = _extract_money_mentions(lines)
    product_lines = _select_product_lines(lines)
    product_name = " ".join(product_lines[:3]).strip() or None
    normalized_product_name = _normalize_text(product_name) if product_name else None
    package_format = _extract_package_format(raw_text)
    quantity_value, quantity_unit = _extract_quantity(package_format)
    unit_price, unit_price_unit = _extract_unit_price(raw_text)
    explicit_percent = _extract_percent(raw_text)
    loyalty_amount = _select_single_amount(price_mentions, "loyalty")
    original_price = _select_original_price(price_mentions)
    promo_price = _select_promo_price(price_mentions, normalized_lines)
    offer_mechanism = _detect_offer_mechanism(
        normalized_lines=normalized_lines,
        promo_price=promo_price,
        original_price=original_price,
        loyalty_amount=loyalty_amount,
        explicit_percent=explicit_percent,
    )
    loyalty_type = "ticket_e_leclerc" if loyalty_amount is not None else None
    conditions = _extract_conditions(lines)
    starts_at = _to_date_string(catalog.starts_at)
    ends_at = _to_date_string(catalog.ends_at)

    validation_errors = _collect_validation_errors(
        product_name=product_name,
        package_format=package_format,
        promo_price=promo_price,
        loyalty_amount=loyalty_amount,
        offer_mechanism=offer_mechanism,
        price_mentions=price_mentions,
        product_line_count=len(product_lines),
        region=region,
    )
    extraction_confidence = _compute_confidence(
        region=region,
        product_name=product_name,
        package_format=package_format,
        promo_price=promo_price,
        original_price=original_price,
        unit_price=unit_price,
        loyalty_amount=loyalty_amount,
        offer_mechanism=offer_mechanism,
        starts_at=starts_at,
        ends_at=ends_at,
        validation_errors=validation_errors,
    )
    candidate_status = _status_from_confidence(extraction_confidence, validation_errors)

    return PromotionCandidate(
        page_number=region.page_number,
        region_id=region.region_id,
        bounding_box=region.bounding_box,
        raw_text=raw_text,
        product_name=product_name,
        normalized_product_name=normalized_product_name,
        brand=_extract_brand(product_name),
        package_format=package_format,
        quantity_value=quantity_value,
        quantity_unit=quantity_unit,
        promo_price=promo_price,
        original_price=original_price,
        discount_percent=explicit_percent,
        unit_price=unit_price,
        unit_price_unit=unit_price_unit,
        loyalty_amount=loyalty_amount,
        loyalty_type=loyalty_type,
        offer_mechanism=offer_mechanism,
        conditions=conditions,
        starts_at=starts_at,
        ends_at=ends_at,
        extraction_confidence=extraction_confidence,
        segmentation_confidence=region.segmentation_confidence,
        price_product_distance=region.price_product_distance,
        price_anchor_count=region.price_anchor_count,
        overlapping_region_count=region.overlapping_region_count,
        layout_type=region.layout_type,
        validation_errors=validation_errors,
        candidate_status=candidate_status,
    )


def _extract_money_mentions(lines: list[str]) -> list[MoneyMention]:
    mentions: list[MoneyMention] = []
    for line_index, line in enumerate(lines):
        normalized = _normalize_text(line)
        role = "promo"
        if any(keyword in normalized for keyword in KEYWORD_LOYALTY):
            role = "loyalty"
        elif any(keyword in normalized for keyword in KEYWORD_ORIGINAL):
            role = "original"
        elif UNIT_PRICE_RE.search(line):
            role = "unit"
        elif any(keyword in normalized for keyword in KEYWORD_STARTING):
            role = "starting_from"
        for match in MONEY_RE.finditer(line):
            mentions.append(
                MoneyMention(
                    amount=_parse_money(match.group(1)),
                    line_index=line_index,
                    role=role,
                    raw_text=line,
                )
            )
    return mentions


def _select_product_lines(lines: list[str]) -> list[str]:
    selected: list[str] = []
    for line in lines:
        normalized = _normalize_text(line)
        if not normalized:
            continue
        if MONEY_RE.search(line) and len(normalized) < 8:
            continue
        if any(keyword in normalized for keyword in KEYWORD_CONDITIONS) and len(normalized) < 20:
            continue
        if re.fullmatch(r"[\d.,%/\-\s]+", line):
            continue
        if not re.search(r"[A-Za-zÀ-ÿ]", line):
            continue
        selected.append(line.strip())
    return selected


def _extract_package_format(raw_text: str) -> str | None:
    match = PACKAGE_RE.search(raw_text)
    return match.group(0).strip() if match else None


def _extract_quantity(package_format: str | None) -> tuple[float | None, str | None]:
    if not package_format:
        return None, None
    match = re.search(r"(\d+(?:[,.]\d+)?)\s*(kg|g|mg|l|cl|ml|litre|litres)", package_format, flags=re.IGNORECASE)
    if not match:
        return None, None
    value = float(match.group(1).replace(",", "."))
    return value, match.group(2).lower()


def _extract_unit_price(raw_text: str) -> tuple[float | None, str | None]:
    match = UNIT_PRICE_RE.search(raw_text)
    if not match:
        return None, None
    return _parse_money(match.group(1)), match.group(2).lower()


def _extract_percent(raw_text: str) -> float | None:
    match = PERCENT_RE.search(raw_text)
    return float(match.group(1)) if match else None


def _select_single_amount(mentions: list[MoneyMention], role: str) -> float | None:
    for mention in mentions:
        if mention.role == role:
            return mention.amount
    return None


def _select_original_price(mentions: list[MoneyMention]) -> float | None:
    originals = [mention.amount for mention in mentions if mention.role == "original"]
    return max(originals) if originals else None


def _select_promo_price(mentions: list[MoneyMention], normalized_lines: list[str]) -> float | None:
    promo_mentions = [mention.amount for mention in mentions if mention.role == "promo"]
    if promo_mentions:
        return min(promo_mentions)
    if any(any(keyword in line for keyword in KEYWORD_STARTING) for line in normalized_lines):
        for mention in mentions:
            if mention.role == "starting_from":
                return mention.amount
    return None


def _detect_offer_mechanism(
    *,
    normalized_lines: list[str],
    promo_price: float | None,
    original_price: float | None,
    loyalty_amount: float | None,
    explicit_percent: float | None,
) -> str:
    joined = " ".join(normalized_lines)
    if any(keyword in joined for keyword in KEYWORD_SECOND):
        return "second_item_discount"
    if any(keyword in joined for keyword in KEYWORD_FREE):
        return "free_item"
    if any(keyword in joined for keyword in KEYWORD_MULTI):
        return "multi_buy"
    if explicit_percent is not None:
        return "percentage_discount"
    if any(keyword in joined for keyword in KEYWORD_STARTING):
        return "starting_from"
    if loyalty_amount is not None:
        return "loyalty_credit"
    if promo_price is not None and original_price is not None and original_price > promo_price:
        return "direct_discount"
    if promo_price is not None:
        return "simple_price"
    return "unknown"


def _extract_conditions(lines: list[str]) -> str | None:
    matches = [line.strip() for line in lines if any(keyword in _normalize_text(line) for keyword in KEYWORD_CONDITIONS)]
    return " | ".join(matches) if matches else None


def _collect_validation_errors(
    *,
    product_name: str | None,
    package_format: str | None,
    promo_price: float | None,
    loyalty_amount: float | None,
    offer_mechanism: str,
    price_mentions: list[MoneyMention],
    product_line_count: int,
    region: PageRegion,
) -> list[str]:
    errors: list[str] = []
    if not product_name:
        errors.append("missing_product_name")
    if promo_price is None and loyalty_amount is None:
        errors.append("missing_price")
    if package_format is None:
        errors.append("missing_package_format")
    promo_amounts = sorted({mention.amount for mention in price_mentions if mention.role == "promo"})
    if len(promo_amounts) > 1:
        errors.append("ambiguous_multiple_prices")
    if region.price_anchor_count > 1:
        errors.append("multiple_price_anchors")
    if product_line_count >= 4 or (product_line_count >= 2 and len(promo_amounts) > 1):
        errors.append("multiple_products_in_region")
    if region.overlapping_region_count > 0:
        errors.append("overlapping_region")
    if region.price_product_distance is not None and region.price_product_distance > 220:
        errors.append("price_too_far_from_product")
    if offer_mechanism == "starting_from":
        errors.append("starting_from_offer")
    if offer_mechanism == "loyalty_credit" and promo_price is None:
        errors.append("loyalty_without_immediate_price")
    if region.layout_type == "dense_list":
        errors.append("dense_list_layout")
    return errors


def _compute_confidence(
    *,
    region: PageRegion,
    product_name: str | None,
    package_format: str | None,
    promo_price: float | None,
    original_price: float | None,
    unit_price: float | None,
    loyalty_amount: float | None,
    offer_mechanism: str,
    starts_at: str | None,
    ends_at: str | None,
    validation_errors: list[str],
) -> int:
    score = 28
    average_line_score = sum(line.score for line in region.lines) / max(len(region.lines), 1)
    score += min(10, int(round(average_line_score * 10)))
    if product_name:
        score += 24
    if promo_price is not None:
        score += 18
    if package_format:
        score += 10
    if unit_price is not None:
        score += 5
    if original_price is not None:
        score += 4
    if loyalty_amount is not None:
        score += 4
    if offer_mechanism != "unknown":
        score += 8
    if starts_at and ends_at:
        score += 5
    if 2 <= len(region.lines) <= 7:
        score += 5
    if region.segmentation_confidence >= 85:
        score += 8
    elif region.segmentation_confidence >= 70:
        score += 4
    elif region.segmentation_confidence <= 45:
        score -= 8

    penalties = {
        "missing_product_name": 28,
        "missing_price": 26,
        "missing_package_format": 10,
        "ambiguous_multiple_prices": 18,
        "multiple_price_anchors": 18,
        "multiple_products_in_region": 18,
        "starting_from_offer": 12,
        "loyalty_without_immediate_price": 10,
        "overlapping_region": 14,
        "price_too_far_from_product": 14,
        "dense_list_layout": 10,
        "duplicate_same_page": 8,
        "duplicate_cross_page": 6,
    }
    for error in validation_errors:
        score -= penalties.get(error, 8)
    return max(0, min(100, score))


def _status_from_confidence(score: int, validation_errors: list[str]) -> str:
    if score >= 85:
        return "needs_review" if validation_errors else "reliable"
    if score >= 60:
        return "needs_review"
    return "rejected"


def _extract_brand(product_name: str | None) -> str | None:
    if not product_name:
        return None
    tokens = [token for token in product_name.split() if token]
    if not tokens:
        return None
    first = tokens[0].strip(".,;:()")
    return first if len(first) >= 2 and len(first) <= 18 and first.upper() == first else None


def _to_date_string(value: datetime | None) -> str | None:
    return value.date().isoformat() if value else None


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    lowered = "".join(
        char for char in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(char)
    )
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9%/]+", " ", lowered)).strip()


def _parse_money(value: str) -> float:
    cleaned = value.replace(" ", "").replace(".", "").replace(",", ".")
    return round(float(cleaned), 2)
