from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from . import receipt_parser_fr as _base
from .geometry_types import OCRToken
from .line_reconstructor import ReconstructedLine


_MONEY_RE = re.compile(r"(?<!\d)(\d{1,5}[.,]\d{2})(?!\d)")
_DETAIL_RE = re.compile(
    r"\b(?P<quantity>\d{1,3})\s*[xX×]\s*"
    r"(?P<unit_price>\d+[.,]\d{2})\b",
    re.IGNORECASE,
)
_DECLARED_U_ITEMS_RE = re.compile(
    r"\bTOTAL\s*[\[\(]?\s*(\d{1,3})\s*[\]\)]?\s+ARTICLES?\b",
    re.IGNORECASE,
)
_U_LINE_COUNT_RE = re.compile(
    r"\b(?:NOMBRE|NANBRE|NOMBRE|NB|NBR)\b.*\bLIGNES?\b.*\bARTICLES?\b",
    re.IGNORECASE,
)
_U_LINE_COUNT_VALUE_RE = re.compile(
    r"\bLIGNES?\s+D['’]?\s*ARTICLES?\s*(\d{1,3})\b",
    re.IGNORECASE,
)

_U_SECTION_LABELS = frozenset(
    {
        "CAFE",
        "TORREFIE/SOLUBLE",
        "CAFE TORREFIE/SOLUBLE",
        "CEREALES ET POUDRES CHOCOLAT",
        "CEREALES ET POUDRE CHOCOLAT",
        "CHARCT.LS UUCI",
        "CHARCUTERIE LS UVCI",
        "CONFISERTE",
        "CONFISERIE",
        "COUSCOUS PUREE LEG SECS BLE",
        "FROMAGE LS",
        "HUILES",
        "LAITS ET DERIVES",
        "MOUCHOIRS",
        "PARFUMERTE",
        "PARFUMERIE",
        "PATES",
        "SAUCES CHAUDES",
        "SURGELE SALE",
        "SURGELE SUCRE",
        "ULTRA FRAIS",
    }
)

_U_EXACT_NAME_CORRECTIONS = {
    "COOUILLETTES": "COQUILLETTES",
    "SAUUAGE": "SAUVAGE",
}


def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    normalized = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    return re.sub(r"\s+", " ", normalized.upper()).strip()


def _money(value: str) -> Decimal | None:
    match = _MONEY_RE.search(value)
    if match is None:
        return None
    try:
        return Decimal(match.group(1).replace(",", ".")).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
    except Exception:
        return None


def _clean_detail_text(value: str) -> str:
    cleaned = value.replace("|", " ")
    cleaned = re.sub(
        r"^\s*[Iil]\s*[xX×]\b",
        "1 x",
        cleaned,
    )
    cleaned = re.sub(
        r"(?<=\d)\.\s*,(?=\d{2}\b)",
        ",",
        cleaned,
    )
    return re.sub(r"\s+", " ", cleaned).strip()


def _is_super_u_receipt(lines: list[ReconstructedLine]) -> bool:
    for line in lines[:12]:
        normalized = _fold(line.text).replace(" ", "")
        if normalized.startswith("SUPERU"):
            return True
        if normalized.startswith("HYPERU"):
            return True
        if normalized.startswith("UEXPRESS"):
            return True
    return False


def _canonical_store_name(lines: list[ReconstructedLine]) -> str:
    for line in lines[:12]:
        normalized = _fold(line.text).replace(" ", "")
        if normalized.startswith("HYPERU"):
            return "Hyper U"
        if normalized.startswith("UEXPRESS"):
            return "U Express"
    return "Super U"


def _store_location(lines: list[ReconstructedLine]) -> str | None:
    for line in lines[1:12]:
        text = line.text.strip()
        normalized = _fold(text)
        if normalized in {"PITON ST LEU", "PITON SAINT LEU"}:
            return "Piton Saint-Leu"

    for line in lines[1:12]:
        text = line.text.strip()
        normalized = _fold(text)
        compact = normalized.replace(" ", "")
        if not text:
            continue
        if compact.startswith(("SUPERU", "HYPERU", "UEXPRESS")):
            continue
        if normalized.startswith(
            (
                "MAGASIN",
                "MAUAGIN",
                "TELEPHONE",
                "TEL ",
                "TVA",
                "TUA",
                "FRANCE",
            )
        ):
            continue
        if re.search(r"\b\d{5}\b", normalized):
            city = re.sub(r"^.*?\b\d{5}\b", "", text).strip(" ,-")
            if city:
                return city.title()
            continue
        if re.search(r"\b(?:ST|SAINT)[ -]?[A-Z]{2,}\b", normalized):
            return text.title()
    return None


def _token_center_x(token: OCRToken) -> float:
    return float(token.box.center_x)


def _token_score(token: OCRToken) -> float:
    return float(token.score)


def _min_confidence(tokens: Iterable[OCRToken]) -> float:
    scores = [_token_score(token) for token in tokens]
    return round(min(scores), 6) if scores else 0.0


def _right_side_threshold(lines: list[ReconstructedLine]) -> float:
    x_max_values = [
        float(token.box.x_max)
        for line in lines
        for token in line.tokens
    ]
    if not x_max_values:
        return 0.0
    return max(x_max_values) * 0.68


def _right_side_price(
    line: ReconstructedLine,
    threshold: float,
) -> tuple[Decimal | None, list[OCRToken]]:
    candidates: list[tuple[float, Decimal, OCRToken]] = []
    for token in line.tokens:
        if _token_center_x(token) < threshold:
            continue
        parsed = _money(token.text)
        if parsed is None:
            continue
        candidates.append((_token_center_x(token), parsed, token))

    if not candidates:
        return None, []

    candidates.sort(key=lambda entry: entry[0])
    _, amount, token = candidates[0]
    return amount, [token]


def _vat_code(
    line: ReconstructedLine,
    threshold: float,
) -> int | None:
    ordered = sorted(
        line.tokens,
        key=_token_center_x,
        reverse=True,
    )
    for token in ordered:
        if _token_center_x(token) < threshold:
            continue
        raw = token.text.strip()
        direct = re.fullmatch(r"(\d{1,2})", raw)
        if direct:
            return int(direct.group(1))
        trailing = re.search(
            r"(?:€|EUR)\s*(\d{1,2})\s*$",
            raw,
            re.IGNORECASE,
        )
        if trailing:
            return int(trailing.group(1))
    return None


def _is_section_label(value: str) -> bool:
    normalized = _fold(value)
    return (
        normalized in _U_SECTION_LABELS
        or normalized.startswith("PARFUMER")
        or normalized.startswith("CONFISER")
        or normalized.startswith("CHARCT")
    )


def _description_tokens(
    line: ReconstructedLine,
    threshold: float,
) -> list[OCRToken]:
    selected: list[OCRToken] = []
    for token in sorted(line.tokens, key=_token_center_x):
        if _token_center_x(token) >= threshold:
            continue

        text = token.text.strip()
        if not re.search(r"[A-Za-zÀ-ÿ]", text):
            continue

        detail_text = _clean_detail_text(text)
        if _DETAIL_RE.search(detail_text):
            continue

        without_money = _MONEY_RE.sub(" ", text)
        residue = _fold(without_money)
        residue = re.sub(r"\b(?:EUR|EURO|EUROS|E)\b", " ", residue)
        residue = re.sub(r"\d+", " ", residue)
        residue = re.sub(r"[^A-Z]+", "", residue)
        if not residue:
            continue

        if _is_section_label(text):
            continue

        selected.append(token)

    return selected


def _section_tokens(
    line: ReconstructedLine,
    threshold: float,
) -> list[OCRToken]:
    return [
        token
        for token in line.tokens
        if _token_center_x(token) < threshold
        and re.search(r"[A-Za-zÀ-ÿ]", token.text)
        and _is_section_label(token.text)
    ]


def _is_section_only(
    line: ReconstructedLine,
    threshold: float,
) -> bool:
    text_tokens = [
        token
        for token in line.tokens
        if _token_center_x(token) < threshold
        and re.search(r"[A-Za-zÀ-ÿ]", token.text)
        and _DETAIL_RE.search(_clean_detail_text(token.text)) is None
    ]
    return bool(text_tokens) and all(
        _is_section_label(token.text)
        for token in text_tokens
    )


def _clean_product_name(value: str) -> str:
    cleaned = _base._correct_common_product_ocr(
        _base._strip_product_marker(value)
    )
    for source, target in _U_EXACT_NAME_CORRECTIONS.items():
        cleaned = re.sub(
            rf"\b{re.escape(source)}\b",
            target,
            cleaned,
            flags=re.IGNORECASE,
        )
    return re.sub(r"\s+", " ", cleaned).strip()


def _summary_start(line: ReconstructedLine) -> bool:
    normalized = _fold(line.text)
    return bool(_U_LINE_COUNT_RE.search(normalized))


def _declared_item_count(
    lines: list[ReconstructedLine],
) -> int | None:
    for line in lines:
        match = _DECLARED_U_ITEMS_RE.search(_fold(line.text))
        if match:
            return int(match.group(1))
    return None


def _declared_product_line_count(
    lines: list[ReconstructedLine],
) -> int | None:
    for line in lines:
        normalized = _fold(line.text)
        match = _U_LINE_COUNT_VALUE_RE.search(normalized)
        if match:
            return int(match.group(1))

        if _U_LINE_COUNT_RE.search(normalized):
            fallback = re.search(r"(\d{1,3})\s*$", normalized)
            if fallback:
                return int(fallback.group(1))
    return None


def _summary_total(
    lines: list[ReconstructedLine],
    *,
    threshold: float,
    items_total: Decimal,
) -> Decimal | None:
    summary_index = None
    for index, line in enumerate(lines):
        if _summary_start(line):
            summary_index = index
            break

    if summary_index is None:
        return None

    line_count_line = lines[summary_index]
    own_amount, _ = _right_side_price(line_count_line, threshold)
    if (
        own_amount is not None
        and summary_index + 1 < len(lines)
        and _DECLARED_U_ITEMS_RE.search(
            _fold(lines[summary_index + 1].text)
        )
    ):
        return own_amount

    following = lines[summary_index + 1:summary_index + 4]
    for offset, candidate in enumerate(following, start=1):
        normalized = _fold(candidate.text)
        amount, _ = _right_side_price(candidate, threshold)

        if (
            amount is not None
            and offset + summary_index + 1 < len(lines)
            and _DECLARED_U_ITEMS_RE.search(
                _fold(lines[offset + summary_index + 1].text)
            )
        ):
            return amount

        if (
            _DECLARED_U_ITEMS_RE.search(normalized)
            and amount is not None
        ):
            return amount

    candidates: list[Decimal] = []
    for line in lines[summary_index:]:
        normalized = _fold(line.text)
        if normalized.startswith(
            (
                "SOUS TOTAL",
                "SOUS-TOTAL",
                "TOTAL TVA",
                "TOTAL TUA",
                "TOTAL HT",
                "ESPECES",
                "RENDU",
            )
        ):
            continue
        if "ELIGIBLES TR" in normalized:
            continue

        for token in line.tokens:
            parsed = _money(token.text)
            if parsed is not None:
                candidates.append(parsed)

    matching = [
        candidate
        for candidate in candidates
        if abs(candidate - items_total) <= Decimal("0.02")
    ]
    return matching[0] if matching else None


def _append_source_line(
    item: _base.ParsedReceiptItem,
    line_id: int,
) -> None:
    if line_id not in item.source_line_ids:
        item.source_line_ids.append(line_id)


def _apply_detail(
    item: _base.ParsedReceiptItem,
    *,
    line: ReconstructedLine,
    quantity: int,
    unit_price: Decimal,
    detail_text: str,
) -> None:
    normalized_signature = (
        quantity,
        unit_price.quantize(Decimal("0.01")),
    )
    existing_signature = None
    if item.raw_detail:
        existing_match = _DETAIL_RE.search(
            _clean_detail_text(item.raw_detail)
        )
        if existing_match:
            existing_signature = (
                int(existing_match.group("quantity")),
                Decimal(
                    existing_match.group("unit_price").replace(",", ".")
                ).quantize(Decimal("0.01")),
            )

    if existing_signature == normalized_signature:
        return

    item.quantity = float(quantity)
    item.unit_price = float(unit_price)
    item.item_type = "multibuy"
    item.raw_detail = detail_text
    _append_source_line(item, line.line_id)

    detail_confidence = _min_confidence(line.tokens)
    if item.ocr_confidence <= 0:
        item.ocr_confidence = detail_confidence
    elif detail_confidence > 0:
        item.ocr_confidence = min(
            item.ocr_confidence,
            detail_confidence,
        )

    expected_total = (
        unit_price * Decimal(quantity)
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    actual_total = Decimal(str(item.total_price)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    item.needs_review = (
        item.needs_review
        or item.ocr_confidence
        < _base.ITEM_REVIEW_CONFIDENCE_THRESHOLD
        or abs(expected_total - actual_total) > Decimal("0.02")
    )


def _new_item(
    *,
    name: str,
    amount: Decimal,
    vat_code: int | None,
    tokens: list[OCRToken],
    source_line_ids: list[int],
) -> _base.ParsedReceiptItem:
    confidence = _min_confidence(tokens)
    generic = _base._is_generic_non_specific_product(name)
    return _base.ParsedReceiptItem(
        raw_name=name,
        quantity=1.0,
        unit_price=float(amount),
        total_price=float(amount),
        vat_code=vat_code,
        item_type="generic_department" if generic else "standard",
        raw_detail=None,
        weight_kg=None,
        price_per_kg=None,
        ocr_confidence=confidence,
        source_line_ids=list(dict.fromkeys(source_line_ids)),
        needs_review=(
            confidence < _base.ITEM_REVIEW_CONFIDENCE_THRESHOLD
            or generic
        ),
    )


def _parse_super_u(
    parser: _base.ReceiptParserFR,
    document,
    lines: list[ReconstructedLine],
) -> _base.ParsedReceipt:
    del document

    threshold = _right_side_threshold(lines)
    receipt_date = parser._extract_date(lines)
    receipt_time = parser._extract_time(lines)
    declared_items = _declared_item_count(lines)
    declared_lines = _declared_product_line_count(lines)

    items: list[_base.ParsedReceiptItem] = []
    sections: list[str] = []
    warnings: list[str] = []
    started = False

    carried_price: Decimal | None = None
    carried_vat: int | None = None
    carried_tokens: list[OCRToken] = []
    carried_source_line_ids: list[int] = []

    pending_name: str | None = None
    pending_tokens: list[OCRToken] = []
    pending_line_id: int | None = None

    for line in lines:
        normalized = _fold(line.text)

        if "VENTE" in normalized:
            started = True
            pending_name = None
            continue

        if not started:
            continue

        if _summary_start(line):
            break

        right_price, right_price_tokens = _right_side_price(
            line,
            threshold,
        )
        vat_code = _vat_code(line, threshold)
        detail_text = _clean_detail_text(line.text)
        detail_match = _DETAIL_RE.search(detail_text)

        if _is_section_only(line, threshold):
            section_values = [
                token.text.strip()
                for token in _section_tokens(line, threshold)
            ]
            for section in section_values:
                if section and section not in sections:
                    sections.append(section)

            if right_price is not None:
                carried_price = right_price
                carried_vat = vat_code
                carried_tokens = list(right_price_tokens)
                carried_source_line_ids = [line.line_id]

            pending_name = None
            pending_tokens = []
            pending_line_id = None
            continue

        if detail_match is not None and items:
            quantity = int(detail_match.group("quantity"))
            unit_price = Decimal(
                detail_match.group("unit_price").replace(",", ".")
            ).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )
            previous = items[-1]
            _apply_detail(
                previous,
                line=line,
                quantity=quantity,
                unit_price=unit_price,
                detail_text=detail_text,
            )

            previous_total = Decimal(
                str(previous.total_price)
            ).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )
            if (
                right_price is not None
                and abs(right_price - previous_total)
                > Decimal("0.02")
                and abs(right_price - unit_price)
                > Decimal("0.02")
            ):
                carried_price = right_price
                carried_vat = vat_code
                carried_tokens = list(right_price_tokens)
                carried_source_line_ids = [line.line_id]
            continue

        name_tokens = _description_tokens(line, threshold)
        name = _clean_product_name(
            " ".join(token.text.strip() for token in name_tokens)
        )

        if not name:
            if (
                pending_name is not None
                and right_price is not None
                and not re.search(r"[A-Za-zÀ-ÿ]", line.text)
            ):
                items.append(
                    _new_item(
                        name=pending_name,
                        amount=right_price,
                        vat_code=vat_code,
                        tokens=pending_tokens + right_price_tokens,
                        source_line_ids=[
                            pending_line_id,
                            line.line_id,
                        ],
                    )
                )
                pending_name = None
                pending_tokens = []
                pending_line_id = None
            continue

        amount = carried_price
        amount_tokens = list(carried_tokens)
        amount_vat = carried_vat
        source_line_ids = list(carried_source_line_ids)

        if amount is None:
            amount = right_price
            amount_tokens = list(right_price_tokens)
            amount_vat = vat_code

        if amount is not None:
            source_line_ids.append(line.line_id)
            items.append(
                _new_item(
                    name=name,
                    amount=amount,
                    vat_code=amount_vat,
                    tokens=name_tokens + amount_tokens,
                    source_line_ids=source_line_ids,
                )
            )
            carried_price = None
            carried_vat = None
            carried_tokens = []
            carried_source_line_ids = []
            pending_name = None
            pending_tokens = []
            pending_line_id = None
            continue

        pending_name = name
        pending_tokens = list(name_tokens)
        pending_line_id = line.line_id

    items_total = sum(
        (Decimal(str(item.total_price)) for item in items),
        Decimal("0"),
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    total = _summary_total(
        lines,
        threshold=threshold,
        items_total=items_total,
    )

    counted_quantity = sum(
        (Decimal(str(item.quantity)) for item in items),
        Decimal("0"),
    )

    if declared_lines is not None and len(items) != declared_lines:
        warnings.append(
            "Nombre de lignes reconstruites "
            f"{len(items)} != nombre de lignes déclaré "
            f"{declared_lines}"
        )

    if (
        declared_items is not None
        and counted_quantity != Decimal(declared_items)
    ):
        warnings.append(
            "Quantité reconstruite "
            f"{counted_quantity:g} != nombre déclaré "
            f"{declared_items}"
        )

    if total is None:
        warnings.append(
            "Total Super U non prouvé; validation manuelle requise"
        )
    elif abs(items_total - total) > Decimal("0.02"):
        warnings.append(
            "Somme des articles "
            f"{items_total:.2f} != total articles {total:.2f}"
        )

    total_float = float(total) if total is not None else None
    return _base.ParsedReceipt(
        store_name=_canonical_store_name(lines),
        store_location=_store_location(lines),
        receipt_date=receipt_date,
        receipt_time=receipt_time,
        declared_item_count=declared_items,
        total=total_float,
        items=items,
        excluded_sections=sections,
        warnings=warnings,
        article_total=total_float,
        immediate_discount_total=None,
        payable_total=None,
    )


def install_super_u_patch() -> None:
    current_parse = _base.ReceiptParserFR.parse
    if getattr(
        current_parse,
        "_budgetkazpei_super_u_patch",
        False,
    ):
        return

    original_parse = current_parse

    def patched_parse(
        self: _base.ReceiptParserFR,
        document,
        lines: list[ReconstructedLine],
    ) -> _base.ParsedReceipt:
        if not _is_super_u_receipt(lines):
            return original_parse(self, document, lines)
        return _parse_super_u(self, document, lines)

    setattr(
        patched_parse,
        "_budgetkazpei_super_u_patch",
        True,
    )
    _base.ReceiptParserFR.parse = patched_parse
