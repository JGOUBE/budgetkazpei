from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from ..line_reconstructor import ReconstructedLine
from .models import ItemCandidate, LineEvidence, LineRole, TotalCandidate
from .normalization import (
    MULTIBUY_RE,
    WEIGHT_RE,
    clean_product_name,
    decimal_money,
    fold,
)


_BLOCKING_ROLES = (
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
        if MULTIBUY_RE.search(text) or WEIGHT_RE.search(text):
            continue
        fragments.append(text)

    raw = " ".join(fragments) if fragments else evidence.text
    return clean_product_name(raw)


def _blocked(line: LineEvidence) -> bool:
    return any(
        line.score_for(role) >= 0.72
        for role in _BLOCKING_ROLES
    )


def _close(
    first: LineEvidence,
    second: LineEvidence,
) -> bool:
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


def _detail_values(
    text: str,
) -> tuple[str, Decimal, Decimal | None, bool | None] | None:
    weight = WEIGHT_RE.search(text)
    if weight is not None:
        weight_kg = Decimal(weight.group("weight").replace(",", "."))
        price_per_kg = decimal_money(weight.group("price_per_kg"))
        return "weight", Decimal("1"), price_per_kg, None

    multibuy = MULTIBUY_RE.search(text)
    if multibuy is None:
        return None

    quantity = Decimal(multibuy.group("quantity"))
    unit_price = decimal_money(multibuy.group("unit_price"))
    return "multibuy", quantity, unit_price, None


class GenericCandidateBuilder:
    """Creates several layout hypotheses for each potential receipt item."""

    def build(
        self,
        physical_lines: list[ReconstructedLine],
        evidence: list[LineEvidence],
        *,
        image_width: int,
    ) -> list[ItemCandidate]:
        by_id = {line.line_id: line for line in physical_lines}
        evidence_by_id = {line.line_id: line for line in evidence}
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
            if len(re.sub(r"[^A-Za-zÀ-ÿ]", "", cleaned)) < 2:
                return
            if total <= 0:
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

            name = _candidate_name(
                physical,
                line_ev,
                image_width=image_width,
            )
            right_price = line_ev.rightmost_money

            # A. Product and line total on the same physical row.
            if (
                name
                and right_price is not None
                and line_ev.score_for(LineRole.PRODUCT) >= 0.55
            ):
                base_score = (
                    2.2
                    + line_ev.score_for(LineRole.PRODUCT) * 2.0
                    + line_ev.confidence
                )
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

            following_ev = evidence[index + 1] if index + 1 < len(evidence) else None
            following_line = (
                by_id[following_ev.line_id]
                if following_ev is not None
                else None
            )

            if following_ev is None or following_line is None:
                continue
            if not _close(line_ev, following_ev):
                continue

            # B. Description followed by a quantity/weight detail row.
            detail = _detail_values(following_ev.text)
            if (
                name
                and detail is not None
                and line_ev.score_for(LineRole.PRODUCT) >= 0.45
                and not _blocked(following_ev)
            ):
                item_type, quantity, unit_price, _ = detail

                expected: Decimal | None = None
                if item_type == "multibuy" and unit_price is not None:
                    expected = (
                        quantity * unit_price
                    ).quantize(
                        Decimal("0.01"),
                        rounding=ROUND_HALF_UP,
                    )

                # A detail such as "2 x 3,90 EUR" contains the unit price.
                # It must not replace an explicit 7,80 EUR line total printed
                # beside the product. Prefer an amount matching the arithmetic,
                # then the product-row amount, then another explicit amount.
                amount_hypotheses: list[tuple[str, Decimal]] = []
                if right_price is not None:
                    amount_hypotheses.append(
                        ("description_line_total", right_price.amount)
                    )
                amount_hypotheses.extend(
                    ("detail_row_amount", money.amount)
                    for money in following_ev.money
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

                if selected_amount is None:
                    selected_amount = next(
                        (
                            hypothesis
                            for hypothesis in amount_hypotheses
                            if (
                                unit_price is None
                                or abs(hypothesis[1] - unit_price)
                                > Decimal("0.02")
                            )
                        ),
                        None,
                    )

                # When quantity × unit price is explicit but the line total is
                # not printed separately, keep a lower-confidence arithmetic
                # hypothesis instead of misusing the unit price as the total.
                if selected_amount is None and expected is not None:
                    selected_amount = (
                        "inferred_quantity_x_unit_price",
                        expected,
                    )

                if selected_amount is not None:
                    total_source, total = selected_amount
                    arithmetic_ok: bool | None = None
                    if expected is not None:
                        arithmetic_ok = (
                            abs(expected - total) <= Decimal("0.02")
                        )

                    score = (
                        3.0
                        + line_ev.score_for(LineRole.PRODUCT) * 1.8
                        + following_ev.score_for(LineRole.DETAIL) * 2.0
                        + min(line_ev.confidence, following_ev.confidence)
                    )
                    if arithmetic_ok is True:
                        score += 1.5
                    elif arithmetic_ok is False:
                        score -= 2.5
                    if total_source == "inferred_quantity_x_unit_price":
                        score -= 0.8

                    add(
                        line_ids=(line_ev.line_id, following_ev.line_id),
                        name=name,
                        quantity=quantity,
                        unit_price=unit_price,
                        total=total,
                        item_type=item_type,
                        confidence=min(
                            line_ev.confidence,
                            following_ev.confidence,
                        ),
                        score=score,
                        proof=[
                            "description_then_detail",
                            total_source,
                        ],
                        arithmetic_ok=arithmetic_ok,
                    )

            # C. Description-only row followed by a financial-only row.
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
                    confidence=min(
                        line_ev.confidence,
                        following_ev.confidence,
                    ),
                    score=3.4 + line_ev.confidence,
                    proof=["description_then_price_row"],
                    arithmetic_ok=True,
                )

            # D. Financial-only row immediately before a description.
            if (
                line_ev.rightmost_money is not None
                and not line_ev.has_letters
                and following_ev.has_letters
                and following_ev.rightmost_money is None
                and following_ev.score_for(LineRole.PRODUCT) >= 0.45
                and not _blocked(following_ev)
            ):
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
                        confidence=min(
                            line_ev.confidence,
                            following_ev.confidence,
                        ),
                        score=3.2 + following_ev.confidence,
                        proof=["price_row_then_description"],
                        arithmetic_ok=True,
                    )

            # E. A short section token and a real product on the same row.
            if (
                right_price is not None
                and line_ev.score_for(LineRole.SECTION) >= 0.4
                and line_ev.score_for(LineRole.PRODUCT) >= 0.55
            ):
                left_tokens = [
                    token
                    for token in physical.tokens
                    if token.box.center_x < image_width * 0.58
                    and re.search(r"[A-Za-zÀ-ÿ]", token.text)
                ]
                if len(left_tokens) >= 2:
                    for token in left_tokens[1:]:
                        split_name = clean_product_name(token.text)
                        if len(re.sub(r"[^A-Za-zÀ-ÿ]", "", split_name)) < 3:
                            continue
                        add(
                            line_ids=(line_ev.line_id,),
                            name=split_name,
                            quantity=Decimal("1"),
                            unit_price=right_price.amount,
                            total=right_price.amount,
                            item_type="standard",
                            confidence=min(
                                line_ev.confidence,
                                float(token.score),
                            ),
                            score=3.0 + line_ev.confidence,
                            proof=["section_and_product_share_row"],
                            arithmetic_ok=True,
                        )

        return self._deduplicate(candidates)

    @staticmethod
    def _deduplicate(
        candidates: Iterable[ItemCandidate],
    ) -> list[ItemCandidate]:
        best: dict[
            tuple[int, int, str, Decimal, Decimal],
            ItemCandidate,
        ] = {}

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
            key=lambda item: (
                item.start_line,
                item.end_line,
                -item.local_score,
                item.normalized_name,
            ),
        )


class GenericTotalCandidateBuilder:
    """Extracts final totals while keeping subtotal/payment candidates separate."""

    def build(
        self,
        evidence: list[LineEvidence],
    ) -> list[TotalCandidate]:
        candidates: list[TotalCandidate] = []

        for index, line in enumerate(evidence):
            money = line.rightmost_money
            if money is None:
                continue

            total_score = line.score_for(LineRole.TOTAL)
            excluded = max(
                line.score_for(LineRole.SUBTOTAL),
                line.score_for(LineRole.TAX),
                line.score_for(LineRole.PAYMENT),
                line.score_for(LineRole.CHANGE),
            )

            if total_score >= 0.55 and excluded < 0.6:
                kind = (
                    "payable"
                    if total_score >= 0.95
                    else "article_total"
                )
                candidates.append(
                    TotalCandidate(
                        line_ids=(line.line_id,),
                        amount=money.amount,
                        kind=kind,
                        confidence=min(line.confidence, money.score),
                        score=5.0 + total_score * 3.0,
                        evidence=["explicit_total_label"],
                    )
                )

            # Count row carrying a right-aligned amount is common and generic.
            if (
                line.declared_count is not None
                and excluded < 0.6
            ):
                candidates.append(
                    TotalCandidate(
                        line_ids=(line.line_id,),
                        amount=money.amount,
                        kind="article_total",
                        confidence=min(line.confidence, money.score),
                        score=6.0,
                        evidence=["declared_count_and_amount_same_row"],
                    )
                )

            # Count row followed by total amount on the next physical row.
            if (
                line.declared_count is not None
                and index + 1 < len(evidence)
            ):
                following = evidence[index + 1]
                following_money = following.rightmost_money
                if (
                    following_money is not None
                    and following.score_for(LineRole.PAYMENT) < 0.6
                    and following.score_for(LineRole.CHANGE) < 0.6
                    and following.score_for(LineRole.TAX) < 0.6
                ):
                    candidates.append(
                        TotalCandidate(
                            line_ids=(line.line_id, following.line_id),
                            amount=following_money.amount,
                            kind="article_total",
                            confidence=min(
                                line.confidence,
                                following.confidence,
                                following_money.score,
                            ),
                            score=5.5,
                            evidence=["declared_count_then_amount_row"],
                        )
                    )

        unique: dict[tuple[tuple[int, ...], Decimal, str], TotalCandidate] = {}
        for candidate in candidates:
            key = (candidate.line_ids, candidate.amount, candidate.kind)
            current = unique.get(key)
            if current is None or candidate.score > current.score:
                unique[key] = candidate

        return sorted(
            unique.values(),
            key=lambda item: (-item.score, item.line_ids),
        )
