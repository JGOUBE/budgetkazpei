from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable

from .geometry_types import OCRDocument, OCRToken
from .line_reconstructor import ReconstructedLine


_MONEY_RE = re.compile(r"(?<!\d)(\d{1,4}[.,]\d{2})(?!\d)")
_MULTIBUY_RE = re.compile(
    r"(?P<quantity>\d+)\s*[xX×]\s*(?P<unit_price>\d+[.,]\d{2})\s*€?"
)
_WEIGHT_RE = re.compile(
    r"(?P<weight>\d+[.,]\d+)\s*kg\s*[xX×]\s*"
    r"(?P<price_per_kg>\d+[.,]\d{2})\s*€?\s*/\s*kg",
    re.IGNORECASE,
)
_DECLARED_ITEMS_RE = re.compile(r"\btotal\s+(\d+)\s+articles?\b", re.IGNORECASE)
_NUMERIC_DATE_RE = re.compile(
    r"\b(?P<day>\d{1,2})[/-](?P<month>\d{1,2})[/-](?P<year>\d{2,4})\b"
)
_TEXTUAL_DATE_RE = re.compile(
    r"\b(?P<day>\d{1,2})\s+"
    r"(?P<month>janvier|février|fevrier|mars|avril|mai|juin|juillet|"
    r"août|aout|septembre|octobre|novembre|décembre|decembre)\s+"
    r"(?P<year>\d{4})\b",
    re.IGNORECASE,
)
_TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):[0-5]\d\b")
_PHONE_RE = re.compile(r"(?:\d{2}[.\s-]){4}\d{2}")

_FRENCH_MONTHS = {
    "janvier": 1,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
}

_NON_ITEM_PREFIXES = (
    "CAISSE ",
    "TICKET ",
    "TOTAL ",
    "CB",
    "CARTE",
    "ESPECES",
    "ESPÈCES",
    "CODE",
    "HT",
    "TVA",
    "TUA",
    "TTC",
)
_FINAL_PAYABLE_LABELS = (
    "RESTE A PAYER",
    "NET A PAYER",
    "TOTAL A PAYER",
    "MONTANT A PAYER",
    "MONTANT DU",
)
_IMMEDIATE_DISCOUNT_LABELS = (
    "BON IMMEDIAT",
    "REMISE IMMEDIATE",
    "AVANTAGE IMMEDIAT",
    "COUPON DEDUIT",
)
_FUTURE_BON_LABELS = (
    "PROCHAIN",
    "PROCHAINE",
    "FUTUR",
    "A VALOIR",
)

ITEM_REVIEW_CONFIDENCE_THRESHOLD = 0.88


def _ascii_fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _normalized_upper(value: str) -> str:
    return re.sub(r"\s+", " ", _ascii_fold(value).upper()).strip()


def _decimal(value: str | float | int | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = str(value).strip().replace("€", "").replace(" ", "").replace(",", ".")
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None


def _decimal_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _decimal_measure(value: str | float | int | None, scale: str = "0.001") -> Decimal | None:
    if value is None:
        return None
    cleaned = str(value).strip().replace(" ", "").replace(",", ".")
    try:
        return Decimal(cleaned).quantize(Decimal(scale), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None


def _join_tokens(tokens: Iterable[OCRToken]) -> str:
    ordered = sorted(tokens, key=lambda token: (token.box.x_min, token.index))
    return " ".join(token.text.strip() for token in ordered if token.text.strip()).strip()


def _parse_money_tokens(tokens: Iterable[OCRToken]) -> Decimal | None:
    for token in sorted(tokens, key=lambda item: (item.box.x_min, item.index)):
        match = _MONEY_RE.search(token.text)
        if match:
            parsed = _decimal(match.group(1))
            if parsed is not None:
                return parsed
    return None


def _parse_line_money(line: ReconstructedLine) -> Decimal | None:
    price_tokens = [token for token in line.tokens if token.column == "price"]
    parsed = _parse_money_tokens(price_tokens)
    if parsed is not None:
        return parsed

    matches = _MONEY_RE.findall(line.text)
    if matches:
        return _decimal(matches[-1])
    return None


def _parse_vat_code(tokens: Iterable[OCRToken]) -> int | None:
    for token in tokens:
        match = re.fullmatch(r"\s*([0-9])\s*", token.text)
        if match:
            return int(match.group(1))
    return None


def _strip_product_marker(value: str) -> str:
    return re.sub(r"^\s*[*•·]+\s*", "", value).strip()


def _is_section_header(value: str) -> bool:
    return bool(re.match(r"^\s*(?:>>|»|›)\s*\S+", value))


def _clean_section_header(value: str) -> str:
    return re.sub(r"^\s*(?:>>|»|›)\s*", "", value).strip()


def _line_confidence(tokens: Iterable[OCRToken]) -> float:
    scores = [float(token.score) for token in tokens]
    return round(min(scores), 6) if scores else 0.0


@dataclass(slots=True)
class ParsedReceiptItem:
    raw_name: str
    quantity: float
    unit_price: float | None
    total_price: float
    vat_code: int | None
    item_type: str
    raw_detail: str | None
    weight_kg: float | None
    price_per_kg: float | None
    ocr_confidence: float
    source_line_ids: list[int]
    needs_review: bool
    canonical_name: str | None = None
    match_type: str | None = None
    match_confidence: float | None = None


@dataclass(slots=True)
class ParsedReceipt:
    store_name: str | None
    store_location: str | None
    receipt_date: str | None
    receipt_time: str | None
    declared_item_count: int | None
    total: float | None
    items: list[ParsedReceiptItem]
    excluded_sections: list[str]
    warnings: list[str] = field(default_factory=list)
    article_total: float | None = None
    immediate_discount_total: float | None = None
    payable_total: float | None = None

    @property
    def items_total(self) -> float:
        total = sum(
            (Decimal(str(item.total_price)) for item in self.items),
            Decimal("0"),
        )
        return float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    @property
    def counted_quantity(self) -> float:
        return float(sum(Decimal(str(item.quantity)) for item in self.items))

    @property
    def article_reconciliation_total(self) -> float | None:
        return self.article_total if self.article_total is not None else self.total

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["items_total"] = self.items_total
        payload["counted_quantity"] = self.counted_quantity
        payload["product_line_count"] = len(self.items)
        return payload

    def save_json(self, path: str | Path) -> None:
        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


@dataclass(slots=True)
class _PendingDescription:
    line_id: int
    raw_name: str
    tokens: list[OCRToken]


@dataclass(slots=True)
class _ReceiptTotals:
    total: float | None
    article_total: float | None
    immediate_discount_total: float | None
    payable_total: float | None
    warnings: list[str] = field(default_factory=list)


class ReceiptParserFR:
    """Geometry-first parser for French supermarket receipts."""

    def parse(
        self,
        document: OCRDocument,
        lines: list[ReconstructedLine],
    ) -> ParsedReceipt:
        store_name = self._extract_store_name(lines)
        store_location = self._extract_store_location(lines, store_name)
        receipt_date = self._extract_date(lines)
        receipt_time = self._extract_time(lines)
        declared_item_count = self._extract_declared_item_count(lines)
        totals = self._extract_totals(lines)

        items: list[ParsedReceiptItem] = []
        excluded_sections: list[str] = []
        warnings: list[str] = list(totals.warnings)
        pending: _PendingDescription | None = None
        item_area_started = False

        for line in lines:
            description_tokens = [
                token for token in line.tokens if token.column in {"description", "detail"}
            ]
            price_tokens = [token for token in line.tokens if token.column == "price"]
            vat_tokens = [token for token in line.tokens if token.column == "vat"]

            description_text = _join_tokens(description_tokens)
            line_text = line.text.strip()
            normalized = _normalized_upper(description_text or line_text)

            declared_match = _DECLARED_ITEMS_RE.search(line_text)
            if declared_match:
                if pending is not None:
                    warnings.append(
                        f"Description sans prix avant le total: {pending.raw_name}"
                    )
                break

            if _is_section_header(description_text):
                item_area_started = True
                section = _clean_section_header(description_text)
                if section:
                    excluded_sections.append(section)
                pending = None
                continue

            if not item_area_started:
                continue

            if not description_text:
                continue

            detail_match = _MULTIBUY_RE.search(description_text)
            weight_match = _WEIGHT_RE.search(description_text)
            price = _parse_money_tokens(price_tokens)
            vat_code = _parse_vat_code(vat_tokens)

            if detail_match or weight_match:
                if pending is None:
                    warnings.append(
                        f"Ligne secondaire sans désignation (ligne {line.line_id}): "
                        f"{description_text}"
                    )
                    continue

                if price is None:
                    warnings.append(
                        f"Ligne secondaire sans prix (ligne {line.line_id}): "
                        f"{description_text}"
                    )
                    continue

                combined_tokens = pending.tokens + line.tokens
                confidence = _line_confidence(combined_tokens)

                if weight_match:
                    weight = _decimal_measure(weight_match.group("weight"))
                    price_per_kg = _decimal(weight_match.group("price_per_kg"))
                    item = ParsedReceiptItem(
                        raw_name=pending.raw_name,
                        quantity=1.0,
                        unit_price=None,
                        total_price=float(price),
                        vat_code=vat_code,
                        item_type="weight",
                        raw_detail=description_text,
                        weight_kg=_decimal_float(weight),
                        price_per_kg=_decimal_float(price_per_kg),
                        ocr_confidence=confidence,
                        source_line_ids=[pending.line_id, line.line_id],
                        needs_review=confidence < ITEM_REVIEW_CONFIDENCE_THRESHOLD,
                    )
                else:
                    quantity = int(detail_match.group("quantity"))
                    unit_price = _decimal(detail_match.group("unit_price"))
                    expected_total = (
                        unit_price * Decimal(quantity)
                        if unit_price is not None
                        else None
                    )
                    arithmetic_ok = (
                        expected_total is not None
                        and abs(expected_total - price) <= Decimal("0.02")
                    )
                    item = ParsedReceiptItem(
                        raw_name=pending.raw_name,
                        quantity=float(quantity),
                        unit_price=_decimal_float(unit_price),
                        total_price=float(price),
                        vat_code=vat_code,
                        item_type="multibuy",
                        raw_detail=description_text,
                        weight_kg=None,
                        price_per_kg=None,
                        ocr_confidence=confidence,
                        source_line_ids=[pending.line_id, line.line_id],
                        needs_review=confidence < ITEM_REVIEW_CONFIDENCE_THRESHOLD or not arithmetic_ok,
                    )
                    if not arithmetic_ok:
                        warnings.append(
                            f"Calcul quantité/prix incohérent pour {pending.raw_name}"
                        )

                items.append(item)
                pending = None
                continue

            if normalized.startswith(_NON_ITEM_PREFIXES):
                pending = None
                continue

            cleaned_name = _strip_product_marker(description_text)
            if not cleaned_name:
                continue

            if price is not None:
                if pending is not None:
                    warnings.append(
                        f"Description sans ligne secondaire: {pending.raw_name}"
                    )
                    pending = None

                confidence = _line_confidence(line.tokens)
                items.append(
                    ParsedReceiptItem(
                        raw_name=cleaned_name,
                        quantity=1.0,
                        unit_price=float(price),
                        total_price=float(price),
                        vat_code=vat_code,
                        item_type="standard",
                        raw_detail=None,
                        weight_kg=None,
                        price_per_kg=None,
                        ocr_confidence=confidence,
                        source_line_ids=[line.line_id],
                        needs_review=confidence < ITEM_REVIEW_CONFIDENCE_THRESHOLD,
                    )
                )
                continue

            if pending is not None:
                warnings.append(
                    f"Description remplacée sans prix: {pending.raw_name}"
                )

            pending = _PendingDescription(
                line_id=line.line_id,
                raw_name=cleaned_name,
                tokens=list(description_tokens),
            )

        parsed = ParsedReceipt(
            store_name=store_name,
            store_location=store_location,
            receipt_date=receipt_date,
            receipt_time=receipt_time,
            declared_item_count=declared_item_count,
            total=totals.total,
            items=items,
            excluded_sections=excluded_sections,
            warnings=warnings,
            article_total=totals.article_total,
            immediate_discount_total=totals.immediate_discount_total,
            payable_total=totals.payable_total,
        )

        reconciliation_total = parsed.article_reconciliation_total
        if (
            reconciliation_total is not None
            and abs(parsed.items_total - reconciliation_total) > 0.02
        ):
            parsed.warnings.append(
                "Somme des articles "
                f"{parsed.items_total:.2f} != total articles {reconciliation_total:.2f}"
            )

        if (
            parsed.declared_item_count is not None
            and abs(parsed.counted_quantity - parsed.declared_item_count) > 0.001
        ):
            parsed.warnings.append(
                "Quantité reconstruite "
                f"{parsed.counted_quantity:g} != nombre déclaré "
                f"{parsed.declared_item_count}"
            )

        return parsed

    @staticmethod
    def _extract_store_name(lines: list[ReconstructedLine]) -> str | None:
        for line in lines[:8]:
            text = line.text.strip()
            normalized = _normalized_upper(text)
            if "LECLERC" in normalized:
                return "E.Leclerc"
        return lines[0].text.strip() if lines else None

    @staticmethod
    def _extract_store_location(
        lines: list[ReconstructedLine],
        store_name: str | None,
    ) -> str | None:
        if not store_name:
            return None

        for line in lines[:8]:
            text = line.text.strip()
            normalized = _normalized_upper(text)
            if not text or "LECLERC" in normalized:
                continue
            if _PHONE_RE.search(text) or _NUMERIC_DATE_RE.search(text):
                continue
            if normalized.startswith(("CAISSE ", "TICKET ")):
                continue
            return text
        return None

    @staticmethod
    def _extract_date(lines: list[ReconstructedLine]) -> str | None:
        for line in lines[:12]:
            text = line.text

            textual = _TEXTUAL_DATE_RE.search(text)
            if textual:
                month_key = _ascii_fold(textual.group("month").lower())
                try:
                    parsed = date(
                        int(textual.group("year")),
                        _FRENCH_MONTHS[month_key],
                        int(textual.group("day")),
                    )
                    return parsed.isoformat()
                except (KeyError, ValueError):
                    pass

            numeric = _NUMERIC_DATE_RE.search(text)
            if numeric:
                year = int(numeric.group("year"))
                if year < 100:
                    year += 2000
                try:
                    parsed = date(
                        year,
                        int(numeric.group("month")),
                        int(numeric.group("day")),
                    )
                    return parsed.isoformat()
                except ValueError:
                    pass
        return None

    @staticmethod
    def _extract_time(lines: list[ReconstructedLine]) -> str | None:
        for line in lines[:12]:
            match = _TIME_RE.search(line.text)
            if match:
                return match.group(0)
        return None

    @staticmethod
    def _extract_declared_item_count(
        lines: list[ReconstructedLine],
    ) -> int | None:
        for line in lines:
            match = _DECLARED_ITEMS_RE.search(line.text)
            if match:
                return int(match.group(1))
        return None

    @staticmethod
    def _extract_total(lines: list[ReconstructedLine]) -> float | None:
        return ReceiptParserFR._extract_totals(lines).total

    @staticmethod
    def _extract_totals(lines: list[ReconstructedLine]) -> _ReceiptTotals:
        article_total = ReceiptParserFR._extract_article_total(lines)
        payable_total = ReceiptParserFR._extract_payable_total(lines)
        immediate_discount_total = ReceiptParserFR._extract_immediate_discount_total(
            lines
        )
        warnings: list[str] = []

        computed_payable = None
        if article_total is not None and immediate_discount_total is not None:
            computed_payable = article_total - immediate_discount_total

        if payable_total is not None:
            if (
                computed_payable is not None
                and abs(payable_total - computed_payable) > 0.02
            ):
                warnings.append(
                    "Total final contradictoire avec la remise immediate; "
                    "validation manuelle requise"
                )
                return _ReceiptTotals(
                    total=None,
                    article_total=article_total,
                    immediate_discount_total=immediate_discount_total,
                    payable_total=payable_total,
                    warnings=warnings,
                )
            return _ReceiptTotals(
                total=payable_total,
                article_total=article_total,
                immediate_discount_total=immediate_discount_total,
                payable_total=payable_total,
                warnings=warnings,
            )

        if computed_payable is not None:
            return _ReceiptTotals(
                total=round(computed_payable, 2),
                article_total=article_total,
                immediate_discount_total=immediate_discount_total,
                payable_total=round(computed_payable, 2),
                warnings=warnings,
            )

        return _ReceiptTotals(
            total=article_total,
            article_total=article_total,
            immediate_discount_total=immediate_discount_total,
            payable_total=None,
            warnings=warnings,
        )

    @staticmethod
    def _extract_article_total(lines: list[ReconstructedLine]) -> float | None:
        """
        Extracts the receipt total from the declared-item-count area.

        On some curved or perspective-distorted receipts, the label
        "Total X articles" and its amount are detected as two adjacent
        physical rows. We therefore first inspect the declared-items row,
        then a very small number of immediately following rows, provided
        they remain close vertically and contain a price-column amount.
        """

        for index, line in enumerate(lines):
            if not _DECLARED_ITEMS_RE.search(line.text):
                continue

            total = _parse_line_money(line)
            if total is not None:
                return float(total)

            declared_height = max(1.0, line.y_max - line.y_min)
            max_vertical_gap = max(45.0, declared_height * 1.8)

            for candidate in lines[index + 1:index + 3]:
                vertical_gap = candidate.center_y - line.center_y
                if vertical_gap < 0:
                    continue
                if vertical_gap > max_vertical_gap:
                    break

                only_financial_columns = bool(candidate.tokens) and all(
                    token.column in {"price", "vat"}
                    for token in candidate.tokens
                )
                if only_financial_columns:
                    candidate_total = _parse_line_money(candidate)
                    if candidate_total is not None:
                        return float(candidate_total)

        return None

    @staticmethod
    def _extract_payable_total(lines: list[ReconstructedLine]) -> float | None:
        for line in lines:
            normalized = _normalized_upper(line.text)
            if not any(label in normalized for label in _FINAL_PAYABLE_LABELS):
                continue
            parsed = _parse_line_money(line)
            if parsed is not None:
                return float(parsed)
        return None

    @staticmethod
    def _extract_immediate_discount_total(
        lines: list[ReconstructedLine],
    ) -> float | None:
        discounts: list[Decimal] = []
        for line in lines:
            normalized = _normalized_upper(line.text)
            if any(label in normalized for label in _FUTURE_BON_LABELS):
                continue
            if not any(label in normalized for label in _IMMEDIATE_DISCOUNT_LABELS):
                continue
            parsed = _parse_line_money(line)
            if parsed is not None:
                discounts.append(abs(parsed))

        if not discounts:
            return None
        total = sum(discounts, Decimal("0")).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        return float(total)
