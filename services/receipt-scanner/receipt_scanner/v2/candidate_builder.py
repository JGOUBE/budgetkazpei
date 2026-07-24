from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from ..line_reconstructor import ReconstructedLine
from .models import ItemCandidate, LineEvidence, LineRole, TotalCandidate
from .normalization import (
    MULTIBUY_QUANTITY_RE,
    MULTIBUY_RE,
    WEIGHT_RE,
    WEIGHT_VALUE_RE,
    clean_product_name,
    decimal_money,
    fold,
    looks_like_loose_weight_detail,
    looks_like_multibuy_detail,
    line_count_summary,
    negative_money_value,
    unsigned_discount_amount,
)


_BLOCKING_ROLES = (
    LineRole.HEADER,
    LineRole.SECTION,
    LineRole.DETAIL,
    LineRole.DISCOUNT,
    LineRole.TOTAL,
    LineRole.SUBTOTAL,
    LineRole.TAX,
    LineRole.PAYMENT,
    LineRole.CHANGE,
    LineRole.COUNT,
    LineRole.FOOTER,
)


def _candidate_name(
    line: ReconstructedLine,
    evidence: LineEvidence,
    *,
    image_width: int,
) -> str:
    threshold = image_width * 0.62
    fragments: list[str] = []

    for token in sorted(line.tokens, key=lambda item: item.box.x_min):
        if token.box.center_x >= threshold:
            continue
        text = token.text.strip()
        if not text or not re.search(r"[A-Za-zÀ-ÿ]", text):
            continue
        if (
            MULTIBUY_RE.search(text)
            or WEIGHT_RE.search(text)
            or looks_like_loose_weight_detail(text)
        ):
            continue
        fragments.append(text)

    raw = " ".join(fragments) if fragments else evidence.text
    return clean_product_name(raw)


def _blocked(line: LineEvidence) -> bool:
    return any(
        line.score_for(role) >= 0.72
        for role in _BLOCKING_ROLES
    )


def _close(first: LineEvidence, second: LineEvidence) -> bool:
    gap = second.center_y - first.center_y
    height = max(
        1.0,
        first.y_max - first.y_min,
        second.y_max - second.y_min,
    )
    same_segment = (
        first.source_segment is None
        or second.source_segment is None
        or first.source_segment == second.source_segment
    )
    return same_segment and 0 <= gap <= max(58.0, height * 2.35)


def _looks_like_item_code_bridge(line: LineEvidence) -> bool:
    """Detect an isolated item reference between its name and detail row.

    OCR can split a single weighed or multiplied article into:
    product name -> PLU/barcode -> weight or quantity detail.

    Only a compact numeric reference is accepted as a bridge. A real product,
    section, amount, total, payment, or other semantic line cannot be skipped.
    """
    if (
        line.money
        or line.declared_count is not None
        or line.has_weight
        or line.has_multibuy
    ):
        return False

    compact_text = re.sub(
        r"[^A-Z0-9]+",
        "",
        line.normalized_text.upper(),
    )
    if not compact_text:
        return False

    if compact_text.startswith(("PLU", "CODE", "REF")):
        compact_text = re.sub(
            r"^(?:PLU|CODE|REF)",
            "",
            compact_text,
        )

    if not compact_text.isdigit():
        return False

    return 4 <= len(compact_text) <= 18


def _find_following_detail(
    evidence: list[LineEvidence],
    *,
    start_index: int,
    max_bridge_lines: int = 2,
) -> tuple[LineEvidence, tuple[int, ...]] | None:
    """Find a nearby detail row while crossing item-code rows only."""
    source = evidence[start_index]
    bridge_ids: list[int] = []

    for offset in range(1, max_bridge_lines + 2):
        target_index = start_index + offset
        if target_index >= len(evidence):
            break

        target = evidence[target_index]
        if not _close(source, target):
            break

        if _detail_values(target) is not None:
            return target, tuple(bridge_ids)

        if _looks_like_item_code_bridge(target):
            bridge_ids.append(target.line_id)
            continue

        break

    return None


def _find_following_discount(
    evidence: list[LineEvidence],
    *,
    end_line_id: int,
    max_bridge_lines: int = 1,
) -> tuple[LineEvidence, tuple[int, ...], Decimal] | None:
    """Attach an explicit negative adjustment to the preceding item.

    A label-only discount row may bridge the item and the signed amount, but
    no product, subtotal, total, payment, or other semantic row may be crossed.
    """
    index_by_id = {
        line.line_id: index
        for index, line in enumerate(evidence)
    }
    start_index = index_by_id.get(end_line_id)
    if start_index is None:
        return None

    source = evidence[start_index]
    proximity_reference = source
    bridge_ids: list[int] = []
    discount_context_seen = False

    for offset in range(1, max_bridge_lines + 2):
        target_index = start_index + offset
        if target_index >= len(evidence):
            break

        target = evidence[target_index]
        if not _close(proximity_reference, target):
            break

        amount = negative_money_value(target.text)
        if amount is not None:
            return target, tuple(bridge_ids), amount

        if target.score_for(LineRole.DISCOUNT) >= 0.72:
            if target.rightmost_money is not None:
                return (
                    target,
                    tuple(bridge_ids),
                    target.rightmost_money.amount,
                )
            bridge_ids.append(target.line_id)
            discount_context_seen = True
            proximity_reference = target
            continue

        # OCR sometimes drops only the minus sign. An unsigned amount can be
        # interpreted as a discount only after a distinct percentage/discount
        # row has already established the context.
        if (
            discount_context_seen
            and target.rightmost_money is not None
            and not target.has_letters
        ):
            unsigned = unsigned_discount_amount(target.text)
            if unsigned is not None:
                return target, tuple(bridge_ids), unsigned

        break

    return None


def _contribution_breakdown(
    evidence: list[LineEvidence],
    *,
    start_index: int,
) -> tuple[tuple[int, ...], Decimal] | None:
    """Reconstruct a product total from DEEE/contribution detail rows.

    Some receipts print:
      product (possibly OCR-corrupted total)
      Dont DEEE / contribution
      Prix hors contributions

    The two detail amounts form the trustworthy product total. This is a
    generic accounting structure, not a retailer-specific rule.
    """
    if start_index + 2 >= len(evidence):
        return None

    first = evidence[start_index]
    contribution = evidence[start_index + 1]
    net = evidence[start_index + 2]

    if not (_close(first, contribution) and _close(contribution, net)):
        return None

    contribution_text = fold(contribution.text)
    net_text = fold(net.text)
    contribution_compact = re.sub(
        r"[^A-Z0-9]+",
        "",
        contribution_text,
    )
    net_compact = re.sub(r"[^A-Z0-9]+", "", net_text)

    contribution_label = (
        "DONTDEEE" in contribution_compact
        or "DONTDEA" in contribution_compact
        or "ECOPARTICIPATION" in contribution_compact
        or "ECOCONTRIBUTION" in contribution_compact
    )
    net_label = "PRIXHORS" in net_compact
    if not (contribution_label and net_label):
        return None

    contribution_amount = contribution.rightmost_money
    net_amount = net.rightmost_money
    if contribution_amount is None or net_amount is None:
        return None

    total = (contribution_amount.amount + net_amount.amount).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    if total <= 0:
        return None

    return (
        (first.line_id, contribution.line_id, net.line_id),
        total,
    )


def _detail_values(
    evidence: LineEvidence,
) -> tuple[str, Decimal, Decimal | None, Decimal | None] | None:
    text = evidence.text
    weight = WEIGHT_RE.search(text)
    if weight is not None:
        weight_kg = Decimal(weight.group("weight").replace(",", "."))
        price_per_kg = decimal_money(weight.group("price_per_kg"))
        expected = (
            weight_kg * price_per_kg
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if price_per_kg else None
        return "weight", Decimal("1"), price_per_kg, expected

    loose_weight = WEIGHT_VALUE_RE.search(text)
    if loose_weight is not None and evidence.has_weight:
        weight_kg = Decimal(loose_weight.group("weight").replace(",", "."))
        price_per_kg = (
            min(evidence.money, key=lambda item: item.x_center).amount
            if evidence.money
            else None
        )
        expected = (
            weight_kg * price_per_kg
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if price_per_kg else None
        return "weight", Decimal("1"), price_per_kg, expected

    multibuy = MULTIBUY_RE.search(text)
    if multibuy is not None and looks_like_multibuy_detail(text):
        quantity = Decimal(multibuy.group("quantity"))
        unit_price = decimal_money(multibuy.group("unit_price"))
        expected = (
            quantity * unit_price
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if unit_price else None
        return "multibuy", quantity, unit_price, expected

    loose_multibuy = MULTIBUY_QUANTITY_RE.search(text)
    if (
        loose_multibuy is not None
        and evidence.money
        and looks_like_multibuy_detail(text)
    ):
        quantity = Decimal(loose_multibuy.group("quantity"))
        unit_price = min(evidence.money, key=lambda item: item.x_center).amount
        expected = (quantity * unit_price).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        return "multibuy", quantity, unit_price, expected

    return None


class GenericCandidateBuilder:
    def build(
        self,
        physical_lines: list[ReconstructedLine],
        evidence: list[LineEvidence],
        *,
        image_width: int,
    ) -> list[ItemCandidate]:
        by_id = {line.line_id: line for line in physical_lines}
        candidates: list[ItemCandidate] = []
        serial = 0

        def add(
            *,
            line_ids: tuple[int, ...],
            name: str,
            quantity: Decimal,
            unit_price: Decimal | None,
            total: Decimal,
            item_type: str,
            confidence: float,
            score: float,
            proof: list[str],
            arithmetic_ok: bool | None,
        ) -> None:
            nonlocal serial
            cleaned = clean_product_name(name)
            if len(re.sub(r"[^A-Za-zÀ-ÿ]", "", cleaned)) < 2 or total <= 0:
                return
            serial += 1
            candidates.append(
                ItemCandidate(
                    candidate_id=f"c{serial:04d}",
                    start_line=min(line_ids),
                    end_line=max(line_ids),
                    source_line_ids=line_ids,
                    raw_name=cleaned,
                    normalized_name=fold(cleaned),
                    quantity=quantity,
                    unit_price=unit_price,
                    total_price=total,
                    item_type=item_type,
                    confidence=round(confidence, 6),
                    local_score=round(score, 4),
                    evidence=proof,
                    arithmetic_ok=arithmetic_ok,
                )
            )

        for index, line_ev in enumerate(evidence):
            physical = by_id[line_ev.line_id]
            if _blocked(line_ev):
                continue

            name = _candidate_name(physical, line_ev, image_width=image_width)
            right_price = line_ev.rightmost_money

            if name and right_price is not None and line_ev.score_for(LineRole.PRODUCT) >= 0.55:
                base_score = 2.2 + line_ev.score_for(LineRole.PRODUCT) * 2.0 + line_ev.confidence
                if right_price.x_center >= image_width * 0.58:
                    base_score += 0.6
                add(
                    line_ids=(line_ev.line_id,),
                    name=name,
                    quantity=Decimal("1"),
                    unit_price=right_price.amount,
                    total=right_price.amount,
                    item_type="standard",
                    confidence=min(line_ev.confidence, right_price.score),
                    score=base_score,
                    proof=["same_line_name_and_right_price"],
                    arithmetic_ok=True,
                )

                breakdown = _contribution_breakdown(
                    evidence,
                    start_index=index,
                )
                if breakdown is not None:
                    breakdown_line_ids, reconstructed_total = breakdown
                    confidence_values = [
                        evidence[line_id].confidence
                        for line_id in range(index, min(index + 3, len(evidence)))
                    ]
                    add(
                        line_ids=breakdown_line_ids,
                        name=name,
                        quantity=Decimal("1"),
                        unit_price=reconstructed_total,
                        total=reconstructed_total,
                        item_type="standard_contribution_rebuilt",
                        confidence=min(confidence_values),
                        score=base_score + 3.0,
                        proof=[
                            "same_line_name_and_right_price",
                            "total_rebuilt_from_contribution_breakdown",
                        ],
                        arithmetic_ok=True,
                    )

            detail_match = _find_following_detail(
                evidence,
                start_index=index,
            )
            if detail_match is not None:
                detail_ev, bridge_line_ids = detail_match
                detail = _detail_values(detail_ev)
                product_score = line_ev.score_for(LineRole.PRODUCT)
                minimum_product_score = (
                    0.20
                    if bridge_line_ids
                    else 0.45
                )

                if (
                    name
                    and detail is not None
                    and product_score >= minimum_product_score
                ):
                    item_type, quantity, unit_price, expected = detail
                    amount_hypotheses: list[tuple[str, Decimal]] = []
                    if right_price is not None:
                        amount_hypotheses.append(
                            ("description_line_total", right_price.amount)
                        )
                    amount_hypotheses.extend(
                        ("detail_row_amount", money.amount)
                        for money in detail_ev.money
                    )

                    selected_amount: tuple[str, Decimal] | None = None
                    if expected is not None:
                        selected_amount = next(
                            (
                                hypothesis
                                for hypothesis in amount_hypotheses
                                if abs(hypothesis[1] - expected)
                                <= Decimal("0.02")
                            ),
                            None,
                        )
                    if selected_amount is None and right_price is not None:
                        selected_amount = (
                            "description_line_total",
                            right_price.amount,
                        )
                    if selected_amount is None and expected is not None:
                        selected_amount = (
                            "inferred_arithmetic_total",
                            expected,
                        )

                    if selected_amount is not None:
                        total_source, total = selected_amount
                        arithmetic_ok = (
                            abs(expected - total) <= Decimal("0.02")
                            if expected is not None
                            else None
                        )
                        confidence_values = [
                            line_ev.confidence,
                            detail_ev.confidence,
                        ]
                        confidence_values.extend(
                            bridge_line.confidence
                            for bridge_line in evidence
                            if bridge_line.line_id in bridge_line_ids
                        )
                        score = (
                            3.0
                            + product_score * 1.8
                            + detail_ev.score_for(LineRole.DETAIL) * 2.0
                            + min(confidence_values)
                        )
                        if arithmetic_ok is True:
                            score += 1.5
                        elif arithmetic_ok is False:
                            score -= 2.5
                        if total_source == "inferred_arithmetic_total":
                            score -= 0.8
                        if bridge_line_ids:
                            score += 0.65

                        source_line_ids = (
                            line_ev.line_id,
                            *bridge_line_ids,
                            detail_ev.line_id,
                        )
                        add(
                            line_ids=source_line_ids,
                            name=name,
                            quantity=quantity,
                            unit_price=unit_price,
                            total=total,
                            item_type=item_type,
                            confidence=min(confidence_values),
                            score=score,
                            proof=[
                                (
                                    "description_code_bridge_then_detail"
                                    if bridge_line_ids
                                    else "description_then_detail"
                                ),
                                total_source,
                            ],
                            arithmetic_ok=arithmetic_ok,
                        )

            previous_ev = (
                evidence[index - 1]
                if index > 0
                else None
            )
            following_ev = (
                evidence[index + 1]
                if index + 1 < len(evidence)
                else None
            )
            if following_ev is None or not _close(line_ev, following_ev):
                continue

            if (
                name
                and right_price is None
                and following_ev.rightmost_money is not None
                and not following_ev.has_letters
                and line_ev.score_for(LineRole.PRODUCT) >= 0.45
                and not _blocked(following_ev)
            ):
                amount = following_ev.rightmost_money.amount
                add(
                    line_ids=(line_ev.line_id, following_ev.line_id),
                    name=name,
                    quantity=Decimal("1"),
                    unit_price=amount,
                    total=amount,
                    item_type="standard",
                    confidence=min(line_ev.confidence, following_ev.confidence),
                    score=3.4 + line_ev.confidence,
                    proof=["description_then_price_row"],
                    arithmetic_ok=True,
                )

            repeated_previous_price = (
                previous_ev is not None
                and previous_ev.rightmost_money is not None
                and previous_ev.score_for(LineRole.PRODUCT) >= 0.75
                and abs(
                    previous_ev.rightmost_money.amount
                    - line_ev.rightmost_money.amount
                ) <= Decimal("0.01")
            ) if line_ev.rightmost_money is not None else False

            if (
                line_ev.rightmost_money is not None
                and not line_ev.has_letters
                and not repeated_previous_price
                and following_ev.has_letters
                and following_ev.rightmost_money is None
                and following_ev.score_for(LineRole.PRODUCT) >= 0.45
                and not _blocked(following_ev)
            ):
                following_line = by_id[following_ev.line_id]
                following_name = _candidate_name(
                    following_line,
                    following_ev,
                    image_width=image_width,
                )
                if following_name:
                    amount = line_ev.rightmost_money.amount
                    add(
                        line_ids=(line_ev.line_id, following_ev.line_id),
                        name=following_name,
                        quantity=Decimal("1"),
                        unit_price=amount,
                        total=amount,
                        item_type="standard",
                        confidence=min(line_ev.confidence, following_ev.confidence),
                        score=3.2 + following_ev.confidence,
                        proof=["price_row_then_description"],
                        arithmetic_ok=True,
                    )

        # Build alternative net-price hypotheses from explicit negative
        # adjustments. Gross candidates remain available so the global solver
        # decides using total and article-count coherence.
        base_candidates = list(candidates)
        evidence_by_id = {
            line.line_id: line
            for line in evidence
        }
        for candidate in base_candidates:
            discount_match = _find_following_discount(
                evidence,
                end_line_id=candidate.end_line,
            )
            if discount_match is None:
                continue

            discount_line, bridge_line_ids, discount_amount = discount_match
            net_total = (
                candidate.total_price - discount_amount
            ).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )
            if net_total <= 0:
                continue

            confidence_values = [
                candidate.confidence,
                discount_line.confidence,
            ]
            confidence_values.extend(
                evidence_by_id[line_id].confidence
                for line_id in bridge_line_ids
                if line_id in evidence_by_id
            )

            add(
                line_ids=(
                    *candidate.source_line_ids,
                    *bridge_line_ids,
                    discount_line.line_id,
                ),
                name=candidate.raw_name,
                quantity=candidate.quantity,
                unit_price=candidate.unit_price,
                total=net_total,
                item_type=(
                    candidate.item_type
                    if candidate.item_type.endswith("_discounted")
                    else f"{candidate.item_type}_discounted"
                ),
                confidence=min(confidence_values),
                score=candidate.local_score + 2.0,
                proof=[
                    *candidate.evidence,
                    "immediate_negative_discount",
                    f"discount={discount_amount}",
                ],
                arithmetic_ok=candidate.arithmetic_ok,
            )

        return self._deduplicate(candidates)

    @staticmethod
    def _deduplicate(candidates: Iterable[ItemCandidate]) -> list[ItemCandidate]:
        best: dict[tuple[int, int, str, Decimal, Decimal], ItemCandidate] = {}
        for candidate in candidates:
            key = (
                candidate.start_line,
                candidate.end_line,
                candidate.normalized_name,
                candidate.quantity,
                candidate.total_price,
            )
            current = best.get(key)
            if current is None or candidate.local_score > current.local_score:
                best[key] = candidate
        return sorted(
            best.values(),
            key=lambda item: (item.start_line, item.end_line, -item.local_score, item.normalized_name),
        )


class GenericTotalCandidateBuilder:
    def build(self, evidence: list[LineEvidence]) -> list[TotalCandidate]:
        candidates: list[TotalCandidate] = []

        def append_candidate(
            *,
            line_ids: tuple[int, ...],
            amount: Decimal,
            kind: str,
            confidence: float,
            score: float,
            proof: str,
        ) -> None:
            candidates.append(
                TotalCandidate(
                    line_ids=line_ids,
                    amount=amount,
                    kind=kind,
                    confidence=confidence,
                    score=score,
                    evidence=[proof],
                )
            )

        for index, line in enumerate(evidence):
            money = line.rightmost_money
            total_score = line.score_for(LineRole.TOTAL)
            excluded = max(
                line.score_for(LineRole.SUBTOTAL),
                line.score_for(LineRole.TAX),
                line.score_for(LineRole.PAYMENT),
                line.score_for(LineRole.CHANGE),
                line.score_for(LineRole.DISCOUNT),
            )

            printed_line_count = line_count_summary(line.text)
            if (
                printed_line_count is not None
                and money is not None
                and excluded < 0.6
            ):
                # OCR can vertically stagger the amount from the following
                # TOTAL row onto the preceding "number of lines" row.
                append_candidate(
                    line_ids=(line.line_id,),
                    amount=money.amount,
                    kind="article_total",
                    confidence=min(line.confidence, money.score),
                    score=7.4,
                    proof="line_count_summary_with_staggered_total_amount",
                )

            if money is not None and total_score >= 0.55 and excluded < 0.6:
                kind = "payable" if total_score >= 0.95 else "article_total"
                append_candidate(
                    line_ids=(line.line_id,),
                    amount=money.amount,
                    kind=kind,
                    confidence=min(line.confidence, money.score),
                    score=(
                        120.0 + total_score * 3.0
                        if kind == "payable"
                        else 5.0 + total_score * 3.0
                    ),
                    proof="explicit_total_label",
                )

            # Explicit TOTAL label split from the right-aligned amount by OCR.
            if total_score >= 0.55 and money is None and excluded < 0.6:
                fallback_payment: tuple[LineEvidence, Decimal] | None = None
                for following in evidence[index + 1:index + 4]:
                    following_money = following.rightmost_money
                    if following.score_for(LineRole.CHANGE) >= 0.7:
                        break
                    if following_money is None:
                        continue
                    if following.score_for(LineRole.PAYMENT) >= 0.7:
                        fallback_payment = (following, following_money.amount)
                        break
                    if max(
                        following.score_for(LineRole.SUBTOTAL),
                        following.score_for(LineRole.TAX),
                    ) >= 0.7:
                        continue
                    split_kind = (
                        "payable"
                        if total_score >= 0.95
                        else "article_total"
                    )
                    append_candidate(
                        line_ids=(line.line_id, following.line_id),
                        amount=following_money.amount,
                        kind=split_kind,
                        confidence=min(line.confidence, following.confidence, following_money.score),
                        score=(
                            118.0
                            if split_kind == "payable"
                            else 7.0
                        ),
                        proof="explicit_total_label_then_amount_row",
                    )
                    break
                else:
                    fallback_payment = None

                if fallback_payment is not None:
                    following, amount = fallback_payment
                    append_candidate(
                        line_ids=(line.line_id, following.line_id),
                        amount=amount,
                        kind="payable",
                        confidence=min(line.confidence, following.confidence),
                        score=3.2,
                        proof="explicit_total_label_then_adjacent_payment_fallback",
                    )

            if (
                money is not None
                and line.score_for(LineRole.PAYMENT) >= 0.8
            ):
                payment_text = fold(line.text)
                card_payment = (
                    payment_text.startswith("CARTE")
                    or payment_text == "CB"
                    or payment_text.startswith("CB ")
                )
                if card_payment:
                    append_candidate(
                        line_ids=(line.line_id,),
                        amount=money.amount,
                        kind="payable",
                        confidence=min(line.confidence, money.score),
                        score=4.0,
                        proof="card_payment_amount_fallback",
                    )

            if line.declared_count is not None and money is not None and excluded < 0.6:
                append_candidate(
                    line_ids=(line.line_id,),
                    amount=money.amount,
                    kind="article_total",
                    confidence=min(line.confidence, money.score),
                    score=6.0,
                    proof="declared_count_and_amount_same_row",
                )

            if line.declared_count is not None and index + 1 < len(evidence):
                following = evidence[index + 1]
                following_money = following.rightmost_money
                if (
                    following_money is not None
                    and following.score_for(LineRole.PAYMENT) < 0.6
                    and following.score_for(LineRole.CHANGE) < 0.6
                    and following.score_for(LineRole.TAX) < 0.6
                ):
                    append_candidate(
                        line_ids=(line.line_id, following.line_id),
                        amount=following_money.amount,
                        kind="article_total",
                        confidence=min(line.confidence, following.confidence, following_money.score),
                        score=5.5,
                        proof="declared_count_then_amount_row",
                    )

        unique: dict[tuple[tuple[int, ...], Decimal, str], TotalCandidate] = {}
        for candidate in candidates:
            key = (candidate.line_ids, candidate.amount, candidate.kind)
            current = unique.get(key)
            if current is None or candidate.score > current.score:
                unique[key] = candidate
        return sorted(unique.values(), key=lambda item: (-item.score, item.line_ids))
