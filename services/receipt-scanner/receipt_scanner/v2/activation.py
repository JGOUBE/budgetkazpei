from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from ..receipt_parser_fr import ParsedReceipt, ParsedReceiptItem


_VALID_TARGET_KINDS = {"article_total", "payable"}
_MONEY_SCALE = Decimal("0.01")
_QUANTITY_SCALE = Decimal("0.001")
_MIN_TARGET_CONFIDENCE = 0.75
_MIN_ITEM_CONFIDENCE = 0.70
_ITEM_REVIEW_CONFIDENCE = 0.88


@dataclass(slots=True)
class V2ActivationCandidate:
    receipt: ParsedReceipt | None
    fallback_reasons: list[str]
    diagnostics: dict[str, object]

    @property
    def accepted(self) -> bool:
        return self.receipt is not None and not self.fallback_reasons


def build_v2_safe_candidate(
    *,
    legacy_receipt: ParsedReceipt,
    v2_result: dict[str, Any],
) -> V2ActivationCandidate:
    """Convert a V2 hypothesis into a production receipt when it is self-consistent.

    The V2 parser currently focuses on product structure and totals. Store and date
    identity remain inherited from the proven legacy parser. The function is
    deliberately conservative: any missing target, arithmetic inconsistency or
    ambiguous discount causes an automatic fallback to the legacy receipt.
    """

    selected = v2_result.get("selected_hypothesis") or {}
    items_payload = selected.get("items") or []
    target = selected.get("target_total") or {}
    reasons: list[str] = []

    target_amount = _decimal(target.get("amount"))
    target_kind = str(target.get("kind") or "").strip().lower()
    target_confidence = _float(target.get("confidence"), default=0.0)
    items_total = _decimal(selected.get("items_total"))
    declared_count = _optional_int(selected.get("declared_count"))
    counted_quantity = _optional_int(selected.get("counted_quantity"))

    if not items_payload:
        reasons.append("v2_no_items")
    if target_amount is None or target_amount <= 0:
        reasons.append("v2_missing_positive_total")
    if target_kind not in _VALID_TARGET_KINDS:
        reasons.append("v2_unknown_total_kind")
    if target_confidence < _MIN_TARGET_CONFIDENCE:
        reasons.append("v2_total_confidence_too_low")
    if items_total is None or items_total < 0:
        reasons.append("v2_invalid_items_total")
    if (
        declared_count is not None
        and counted_quantity is not None
        and declared_count != counted_quantity
    ):
        reasons.append("v2_declared_count_mismatch")

    converted_items: list[ParsedReceiptItem] = []
    recomputed_total = Decimal("0")
    recomputed_quantity = Decimal("0")

    for index, payload in enumerate(items_payload):
        raw_name = str(payload.get("raw_name") or "").strip()
        quantity = _decimal(payload.get("quantity"))
        unit_price = _decimal(payload.get("unit_price"))
        total_price = _decimal(payload.get("total_price"))
        confidence = _float(payload.get("confidence"), default=0.0)
        arithmetic_ok = payload.get("arithmetic_ok")

        if not raw_name:
            reasons.append(f"v2_item_{index + 1}_missing_name")
            continue
        if quantity is None or quantity <= 0:
            reasons.append(f"v2_item_{index + 1}_invalid_quantity")
            continue
        if total_price is None or total_price < 0:
            reasons.append(f"v2_item_{index + 1}_invalid_total")
            continue
        if confidence < _MIN_ITEM_CONFIDENCE:
            reasons.append(f"v2_item_{index + 1}_confidence_too_low")
            continue
        if arithmetic_ok is False:
            reasons.append(f"v2_item_{index + 1}_arithmetic_mismatch")
            continue

        item_type = str(payload.get("item_type") or "standard")
        weight_kg: Decimal | None = None
        price_per_kg: Decimal | None = None
        if item_type.startswith("weight") and unit_price is not None and unit_price > 0:
            price_per_kg = unit_price
            weight_kg = (total_price / unit_price).quantize(
                _QUANTITY_SCALE,
                rounding=ROUND_HALF_UP,
            )

        converted_items.append(
            ParsedReceiptItem(
                raw_name=raw_name,
                quantity=float(quantity),
                unit_price=float(unit_price) if unit_price is not None else None,
                total_price=float(total_price),
                vat_code=None,
                item_type=item_type,
                raw_detail=None,
                weight_kg=float(weight_kg) if weight_kg is not None else None,
                price_per_kg=(
                    float(price_per_kg) if price_per_kg is not None else None
                ),
                ocr_confidence=confidence,
                source_line_ids=[
                    int(value) for value in payload.get("source_line_ids", [])
                ],
                needs_review=confidence < _ITEM_REVIEW_CONFIDENCE,
                canonical_name=None,
                match_type=None,
                match_confidence=None,
            )
        )
        recomputed_total += total_price
        recomputed_quantity += quantity

    recomputed_total = recomputed_total.quantize(
        _MONEY_SCALE,
        rounding=ROUND_HALF_UP,
    )
    recomputed_quantity = recomputed_quantity.quantize(
        _QUANTITY_SCALE,
        rounding=ROUND_HALF_UP,
    )

    if items_total is not None:
        items_total = items_total.quantize(_MONEY_SCALE, rounding=ROUND_HALF_UP)
        if recomputed_total != items_total:
            reasons.append("v2_items_total_recomputation_mismatch")

    if counted_quantity is not None:
        rounded_quantity = int(
            recomputed_quantity.to_integral_value(rounding=ROUND_HALF_UP)
        )
        if rounded_quantity != counted_quantity:
            reasons.append("v2_counted_quantity_recomputation_mismatch")

    target_gap: Decimal | None = None
    if target_amount is not None and items_total is not None:
        target_amount = target_amount.quantize(_MONEY_SCALE, rounding=ROUND_HALF_UP)
        target_gap = (items_total - target_amount).quantize(
            _MONEY_SCALE,
            rounding=ROUND_HALF_UP,
        )
        if target_kind == "article_total" and abs(target_gap) > Decimal("0.02"):
            reasons.append("v2_article_total_not_reconciled")
        if target_kind == "payable":
            if target_gap < Decimal("-0.02"):
                reasons.append("v2_payable_exceeds_items_total")
            permitted_discount = max(
                Decimal("2.00"),
                (target_amount * Decimal("0.20")).quantize(
                    _MONEY_SCALE,
                    rounding=ROUND_HALF_UP,
                ),
            )
            if target_gap > permitted_discount:
                reasons.append("v2_discount_gap_too_large")
            if target_gap > Decimal("0.02") and declared_count is None:
                reasons.append("v2_discount_without_declared_count")

    legacy_payable = _decimal(legacy_receipt.payable_total)
    if (
        target_kind == "article_total"
        and target_amount is not None
        and legacy_payable is not None
        and abs(legacy_payable - target_amount) > Decimal("0.02")
    ):
        reasons.append("legacy_has_different_payable_total")

    diagnostics = {
        "v2_total": float(target_amount) if target_amount is not None else None,
        "v2_total_kind": target_kind or None,
        "v2_items_total": float(items_total) if items_total is not None else None,
        "v2_product_line_count": len(items_payload),
        "v2_counted_quantity": counted_quantity,
        "v2_declared_count": declared_count,
        "v2_score": _float(selected.get("score"), default=0.0),
        "v2_reasons": list(selected.get("reasons") or []),
    }

    if reasons:
        return V2ActivationCandidate(
            receipt=None,
            fallback_reasons=_deduplicate(reasons),
            diagnostics=diagnostics,
        )

    assert target_amount is not None
    assert items_total is not None

    if target_kind == "payable":
        article_total = items_total
        payable_total = target_amount
        immediate_discount_total = max(Decimal("0"), items_total - target_amount)
    else:
        article_total = target_amount
        payable_total = None
        immediate_discount_total = None

    receipt = ParsedReceipt(
        store_name=legacy_receipt.store_name,
        store_location=legacy_receipt.store_location,
        receipt_date=legacy_receipt.receipt_date,
        receipt_time=legacy_receipt.receipt_time,
        declared_item_count=(
            declared_count
            if declared_count is not None
            else legacy_receipt.declared_item_count
        ),
        total=float(target_amount),
        items=converted_items,
        excluded_sections=list(legacy_receipt.excluded_sections),
        warnings=list(legacy_receipt.warnings),
        article_total=float(article_total),
        immediate_discount_total=(
            float(immediate_discount_total)
            if immediate_discount_total is not None
            else None
        ),
        payable_total=(
            float(payable_total) if payable_total is not None else None
        ),
    )
    return V2ActivationCandidate(
        receipt=receipt,
        fallback_reasons=[],
        diagnostics=diagnostics,
    )


def _decimal(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _float(value: object, *, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _optional_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _deduplicate(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
