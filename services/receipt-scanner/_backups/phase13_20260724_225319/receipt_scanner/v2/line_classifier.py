from __future__ import annotations

import re
from collections import defaultdict
from decimal import Decimal
from statistics import mean

from ..line_reconstructor import ReconstructedLine
from .models import LineEvidence, LineRole, MoneyEvidence
from .normalization import (
    BARCODE_RE,
    DATE_RE,
    MONEY_RE,
    NEGATIVE_MONEY_RE,
    PERCENT_RE,
    MULTIBUY_RE,
    PHONE_RE,
    PRODUCT_UNIT_HINT_RE,
    TIME_RE,
    WEIGHT_RE,
    declared_count,
    fold,
    has_letters,
    line_is_mostly_upper,
    line_count_summary,
    looks_like_loose_weight_detail,
    looks_like_phone_line,
    semantic_text_without_money,
    word_count,
)


FINAL_TOTAL_LABELS = (
    "RESTE A PAYER",
    "NET A PAYER",
    "TOTAL A PAYER",
    "MONTANT A PAYER",
    "A PAYER",
)
SUBTOTAL_LABELS = (
    "SOUS TOTAL",
    "SOUS-TOTAL",
    "TOTAL HT",
    "TOTAL TVA",
    "TOTAL TUA",
    "TOTAL REMISE",
    "TOTAL ECONOMIE",
    "TOTAL AVANTAGE",
    "TOTAL FIDELITE",
)
TAX_LABELS = (
    "TVA",
    "TUA",
    "TAUX",
    "BASE HT",
    "MONTANT TVA",
)
PAYMENT_LABELS = (
    "ESPECES",
    "CARTE BLEUE",
    "CARTE BANCAIRE",
    "CB",
    "CHEQUE",
    "PAIEMENT",
)
CHANGE_LABELS = (
    "RENDU",
    "MONNAIE",
)
DISCOUNT_LABELS = (
    "REMISE",
    "PROMOTION",
    "PRIX PROMOTION",
    "BON IMMEDIAT",
    "AVANTAGE IMMEDIAT",
    "COUPON",
)
HEADER_LABELS = (
    "BIENVENUE",
    "MERCI",
    "TELEPHONE",
    "TEL ",
    "TE1 ",
    "SIRET",
    "TVA INTRA",
    "CAISSE",
    "TICKET",
    "OPERATION",
    "VENTE",
)
FOOTER_LABELS = (
    "FIDELITE",
    "SOLDE DE POINTS",
    "A BIENTOT",
    "MERCI DE VOTRE VISITE",
)


class GenericLineClassifier:
    """Assigns several independent semantic scores to each physical OCR row.

    No store name or retailer-specific layout is used. Phase 2 also detects
    arithmetic group subtotals and prevents telephone numbers from becoming
    prices.
    """

    def classify(
        self,
        lines: list[ReconstructedLine],
        *,
        image_width: int,
    ) -> list[LineEvidence]:
        right_zone = max(1.0, image_width * 0.58)
        evidences: list[LineEvidence] = []

        for line in lines:
            text = line.text.strip()
            normalized = fold(text)
            role_scores: defaultdict[str, float] = defaultdict(float)
            money: list[MoneyEvidence] = []
            phone_line = looks_like_phone_line(text)

            # A telephone such as 02.62.34.78.73 contains decimal-looking
            # fragments. They are not monetary evidence.
            if not phone_line:
                for token in line.tokens:
                    for match in MONEY_RE.finditer(token.text):
                        raw_amount = match.group(1).replace(",", ".")
                        from .normalization import decimal_money

                        amount = decimal_money(raw_amount)
                        if amount is None:
                            continue
                        money.append(
                            MoneyEvidence(
                                amount=amount,
                                token_index=token.index,
                                x_center=float(token.box.center_x),
                                score=float(token.score),
                                raw_text=token.text,
                            )
                        )

            letters = has_letters(text)
            semantic_text = semantic_text_without_money(text)
            semantic_letters = has_letters(semantic_text)
            negative_money = NEGATIVE_MONEY_RE.search(text) is not None
            percentage_discount = PERCENT_RE.search(text) is not None
            digits = bool(re.search(r"\d", text))
            count = declared_count(text)
            printed_line_count = line_count_summary(text)
            multibuy = MULTIBUY_RE.search(text) is not None
            weight = (
                WEIGHT_RE.search(text) is not None
                or looks_like_loose_weight_detail(text)
            )
            confidence = (
                min(float(token.score) for token in line.tokens)
                if line.tokens
                else 0.0
            )

            segments = {token.source_segment for token in line.tokens}
            source_segment = next(iter(segments)) if len(segments) == 1 else None
            right_money = [
                item for item in money if item.x_center >= right_zone
            ]

            # Normalize punctuation before interpreting a total label.
            # OCR frequently returns variants such as "TOTAL.:", "TOTAL :",
            # "TOTAL.-" or "TOTAL (24) ARTICLES".
            semantic_label = re.sub(
                r"[^A-Z0-9]+",
                " ",
                semantic_text,
            ).strip()
            semantic_compact = re.sub(
                r"[^A-Z0-9]+",
                "",
                semantic_text,
            )

            if any(
                re.sub(r"[^A-Z0-9]+", "", label)
                in semantic_compact
                for label in FINAL_TOTAL_LABELS
            ):
                role_scores[LineRole.TOTAL.value] += 1.0

            if (
                semantic_compact == "TOTAL"
                or semantic_compact.startswith("TOTALARTICLES")
                or semantic_label.startswith("TOTAL ")
            ):
                role_scores[LineRole.TOTAL.value] += 0.85

            if any(label in normalized for label in SUBTOTAL_LABELS):
                role_scores[LineRole.SUBTOTAL.value] += 1.0
                role_scores[LineRole.TOTAL.value] -= 0.9

            if any(
                normalized.startswith(label)
                for label in PAYMENT_LABELS
            ):
                role_scores[LineRole.PAYMENT.value] += 1.0
                role_scores[LineRole.TOTAL.value] -= 0.8

            if any(
                normalized.startswith(label)
                for label in CHANGE_LABELS
            ):
                role_scores[LineRole.CHANGE.value] += 1.0
                role_scores[LineRole.TOTAL.value] -= 1.0

            if (
                any(label in normalized for label in TAX_LABELS)
                and not weight
            ):
                role_scores[LineRole.TAX.value] += 0.8

            if any(label in normalized for label in DISCOUNT_LABELS):
                role_scores[LineRole.DISCOUNT.value] += 0.9

            # A signed negative amount is a stronger and retailer-independent
            # discount proof than any wording such as "promo" or a weekday.
            if negative_money:
                role_scores[LineRole.DISCOUNT.value] += 1.0
                role_scores[LineRole.PRODUCT.value] -= 0.8

            # A short percentage row without an item code is generic discount
            # context, even when OCR loses the minus sign on the next amount.
            if (
                percentage_discount
                and not BARCODE_RE.search(text)
                and not PRODUCT_UNIT_HINT_RE.search(semantic_text)
                and word_count(semantic_text) <= 8
            ):
                role_scores[LineRole.DISCOUNT.value] += 0.92
                role_scores[LineRole.PRODUCT.value] -= 0.8

            if count is not None or printed_line_count is not None:
                role_scores[LineRole.COUNT.value] += 1.0
                role_scores[LineRole.PRODUCT.value] -= 0.8

            if phone_line or DATE_RE.search(text) or TIME_RE.search(text):
                role_scores[LineRole.HEADER.value] += 1.0

            if any(label in normalized for label in HEADER_LABELS):
                role_scores[LineRole.HEADER.value] += 0.7

            if any(label in normalized for label in FOOTER_LABELS):
                role_scores[LineRole.FOOTER.value] += 0.9

            if multibuy or weight:
                role_scores[LineRole.DETAIL.value] += 1.0
                role_scores[LineRole.PRODUCT.value] -= 0.6

            if semantic_letters and money and not (
                role_scores[LineRole.TOTAL.value] >= 0.6
                or role_scores[LineRole.SUBTOTAL.value] >= 0.6
                or role_scores[LineRole.PAYMENT.value] >= 0.6
                or role_scores[LineRole.CHANGE.value] >= 0.6
                or role_scores[LineRole.TAX.value] >= 0.8
                or role_scores[LineRole.HEADER.value] >= 0.8
                or role_scores[LineRole.DETAIL.value] >= 0.8
                or role_scores[LineRole.DISCOUNT.value] >= 0.8
            ):
                role_scores[LineRole.PRODUCT.value] += 0.85
                if right_money:
                    role_scores[LineRole.PRODUCT.value] += 0.15

            if (
                semantic_letters
                and not money
                and not multibuy
                and not weight
                and line_is_mostly_upper(text)
                and 1 <= word_count(text) <= 5
                and not (
                    role_scores[LineRole.HEADER.value] >= 0.6
                    or role_scores[LineRole.FOOTER.value] >= 0.6
                    or role_scores[LineRole.COUNT.value] >= 0.6
                    or role_scores[LineRole.DISCOUNT.value] >= 0.6
                )
            ):
                role_scores[LineRole.SECTION.value] += 0.55

            if (
                semantic_letters
                and not money
                and role_scores[LineRole.DETAIL.value] < 0.8
            ):
                role_scores[LineRole.PRODUCT.value] += 0.25

            if not role_scores:
                role_scores[LineRole.UNKNOWN.value] = 1.0

            role_scores = defaultdict(
                float,
                {
                    key: round(max(-1.0, min(1.0, value)), 4)
                    for key, value in role_scores.items()
                },
            )

            evidences.append(
                LineEvidence(
                    line_id=line.line_id,
                    text=text,
                    normalized_text=normalized,
                    center_y=float(line.center_y),
                    y_min=float(line.y_min),
                    y_max=float(line.y_max),
                    confidence=round(confidence, 6),
                    source_segment=source_segment,
                    money=money,
                    role_scores=dict(role_scores),
                    has_letters=semantic_letters,
                    has_digits=digits,
                    has_multibuy=multibuy,
                    has_weight=weight,
                    declared_count=count,
                )
            )

        self._mark_group_subtotals(
            evidences,
            lines,
            image_width=image_width,
        )
        self._add_context_scores(evidences)
        return evidences

    @staticmethod
    def _mark_group_subtotals(
        lines: list[LineEvidence],
        physical_lines: list[ReconstructedLine],
        *,
        image_width: int,
    ) -> None:
        """Detect department/group subtotals without retailer dictionaries.

        Two independent proofs are accepted:

        1. Arithmetic proof:
           the amount equals the sum of the preceding product rows.

        2. Layout-boundary proof:
           a short uppercase label without an item code is printed far to the
           left of the recent product descriptions and separates two groups.

        The second proof is essential when OCR misreads one subtotal digit
        (for example 18.73 as 10.73). It does not rely on department names.
        """

        physical_by_id = {
            physical.line_id: physical
            for physical in physical_lines
        }
        recent_product_amounts: list[Decimal] = []
        recent_description_x: list[float] = []

        def description_x(line: LineEvidence) -> float | None:
            physical = physical_by_id.get(line.line_id)
            if physical is None:
                return None

            candidates: list[float] = []
            for token in physical.tokens:
                token_text = token.text.strip()
                if not token_text or not re.search(
                    r"[A-Za-zÀ-ÿ]",
                    token_text,
                ):
                    continue
                if BARCODE_RE.search(token_text):
                    continue
                if MONEY_RE.search(token_text):
                    continue
                candidates.append(float(token.box.x_min))

            return min(candidates) if candidates else None

        def is_summary_or_separator(line: LineEvidence) -> bool:
            return (
                line.score_for(LineRole.TOTAL) >= 0.7
                or line.score_for(LineRole.PAYMENT) >= 0.7
                or line.score_for(LineRole.CHANGE) >= 0.7
                or line.score_for(LineRole.COUNT) >= 0.8
                or line.score_for(LineRole.FOOTER) >= 0.8
            )

        def next_meaningful(index: int) -> LineEvidence | None:
            for following in lines[index + 1:index + 4]:
                if (
                    following.score_for(LineRole.DISCOUNT) >= 0.7
                    or following.score_for(LineRole.DETAIL) >= 0.7
                ):
                    continue
                return following
            return None

        def next_starts_new_group(
            index: int,
        ) -> bool:
            following = next_meaningful(index)
            if following is None:
                return True

            if is_summary_or_separator(following):
                return True

            # A new product group generally starts with an item code/PLU or
            # another high-confidence priced product row.
            return (
                bool(BARCODE_RE.search(following.text))
                or (
                    following.rightmost_money is not None
                    and following.score_for(LineRole.PRODUCT) >= 0.75
                )
            )

        def mark_subtotal(line: LineEvidence) -> None:
            line.role_scores[LineRole.SUBTOTAL.value] = max(
                line.role_scores.get(LineRole.SUBTOTAL.value, 0.0),
                0.97,
            )
            line.role_scores[LineRole.SECTION.value] = max(
                line.role_scores.get(LineRole.SECTION.value, 0.0),
                0.92,
            )
            line.role_scores[LineRole.PRODUCT.value] = min(
                line.role_scores.get(LineRole.PRODUCT.value, 0.0),
                0.10,
            )

        for index, line in enumerate(lines):
            if is_summary_or_separator(line):
                recent_product_amounts.clear()
                recent_description_x.clear()
                continue

            if (
                line.score_for(LineRole.DISCOUNT) >= 0.7
                or line.score_for(LineRole.DETAIL) >= 0.7
                or line.score_for(LineRole.HEADER) >= 0.7
            ):
                continue

            amount = (
                line.rightmost_money.amount
                if line.rightmost_money
                else None
            )
            has_item_code = bool(BARCODE_RE.search(line.text))
            # Count only the semantic label, not the printed amount or
            # currency. For example:
            # "BOISSONS SANS ALCOOL 2.86 EUR" is a three-word label,
            # not a six-word product description.
            semantic_label = MONEY_RE.sub(" ", line.text)
            semantic_label = re.sub(
                r"\b(?:EUR|EURO|EUROS)\b",
                " ",
                semantic_label,
                flags=re.IGNORECASE,
            )
            semantic_label = re.sub(r"\s+", " ", semantic_label).strip()

            short_label = (
                line.has_letters
                and amount is not None
                and line_is_mostly_upper(semantic_label)
                and 1 <= word_count(semantic_label) <= 5
                and not has_item_code
                and not PRODUCT_UNIT_HINT_RE.search(semantic_label)
            )

            arithmetic_match = False
            if short_label and recent_product_amounts:
                # Use the full current group, not only the last five lines.
                subtotal = sum(
                    recent_product_amounts,
                    Decimal("0"),
                )
                arithmetic_match = (
                    abs(subtotal - amount) <= Decimal("0.02")
                )

            layout_boundary_match = False
            if (
                short_label
                and recent_product_amounts
                and recent_description_x
                and next_starts_new_group(index)
            ):
                label_x = description_x(line)
                sorted_x = sorted(recent_description_x)
                median_product_x = sorted_x[len(sorted_x) // 2]

                # The threshold is relative to the image, so it works on
                # resized photos and does not encode a specific receipt.
                layout_boundary_match = (
                    label_x is not None
                    and label_x + image_width * 0.075
                    < median_product_x
                    and label_x <= image_width * 0.42
                )

            if arithmetic_match or layout_boundary_match:
                mark_subtotal(line)
                recent_product_amounts.clear()
                recent_description_x.clear()
                continue

            if (
                amount is not None
                and line.score_for(LineRole.PRODUCT) >= 0.55
                and line.score_for(LineRole.SUBTOTAL) < 0.7
            ):
                recent_product_amounts.append(amount)
                x = description_x(line)
                if x is not None:
                    recent_description_x.append(x)

                # A group can be long. Keep enough history while bounding
                # memory and avoiding unrelated receipt sections.
                recent_product_amounts = recent_product_amounts[-40:]
                recent_description_x = recent_description_x[-40:]

    @staticmethod
    def _add_context_scores(lines: list[LineEvidence]) -> None:
        summary_seen = False
        for index, line in enumerate(lines):
            if (
                line.score_for(LineRole.TOTAL) >= 0.8
                or line.score_for(LineRole.PAYMENT) >= 0.8
                or line.score_for(LineRole.COUNT) >= 0.9
            ):
                summary_seen = True

            if summary_seen and line.score_for(LineRole.PRODUCT) < 0.8:
                line.role_scores[LineRole.FOOTER.value] = max(
                    line.role_scores.get(LineRole.FOOTER.value, 0.0),
                    0.45,
                )

            if index + 1 >= len(lines):
                continue

            following = lines[index + 1]
            gap = following.center_y - line.center_y
            median_height = mean(
                [
                    max(1.0, line.y_max - line.y_min),
                    max(1.0, following.y_max - following.y_min),
                ]
            )
            close = 0 <= gap <= max(54.0, median_height * 2.2)
            same_segment = (
                line.source_segment is None
                or following.source_segment is None
                or line.source_segment == following.source_segment
            )

            if not close or not same_segment:
                continue

            if (
                line.has_letters
                and not line.money
                and (
                    following.has_multibuy
                    or following.has_weight
                    or bool(following.money)
                )
                and line.score_for(LineRole.HEADER) < 0.7
            ):
                line.role_scores[LineRole.PRODUCT.value] = max(
                    line.role_scores.get(LineRole.PRODUCT.value, 0.0),
                    0.72,
                )

            if (
                bool(line.money)
                and not line.has_letters
                and following.has_letters
                and not following.money
            ):
                following.role_scores[LineRole.PRODUCT.value] = max(
                    following.role_scores.get(LineRole.PRODUCT.value, 0.0),
                    0.7,
                )
