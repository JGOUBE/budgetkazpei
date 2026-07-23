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


_MONEY_RE = re.compile(r"(?<!\d)(\d{1,5}[.,]\d{2})(?!\d)")
_MULTIBUY_RE = re.compile(
    r"(?P<quantity>\d+)\s*[xX×]\s*(?P<unit_price>\d+[.,]\d{2})\s*(?:€|EUR)?",
    re.IGNORECASE,
)
_WEIGHT_RE = re.compile(
    r"(?P<weight>\d+[.,]\d+)\s*kg\s*[xX×]\s*"
    r"(?P<price_per_kg>\d+[.,]\d{2})\s*(?:€|EUR)?\s*/?\s*kg",
    re.IGNORECASE,
)
_DECLARED_ITEMS_PATTERNS = (
    re.compile(
        r"\b(?:TOTAL|NOMBRE|NB|NBR)\s*(?:DE\s+)?ARTICLES?\s*[:=]?\s*(\d+)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:TOTAL|NOMBRE|NB|NBR)\s*[:=]?\s*(\d+)\s+ARTICLES?\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(\d+)\s+ARTICLES?\b", re.IGNORECASE),
)
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
_TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b")
_PHONE_RE = re.compile(r"(?:\d{2}[.\s-]){4}\d{2}")
_BARCODE_RE = re.compile(r"(?<!\d)(?:\(\d\))?\s*\d{8,14}(?!\d)")
_POSTCODE_RE = re.compile(r"\b(?:97[124678]\d{2}|[0-8]\d{4}|9[0-6]\d{3})\b")
_WORD_TOKEN_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+|[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+")

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

_STORE_CANONICAL_NAMES = (
    ("E.LECLERC", "E.Leclerc"),
    ("LECLERC", "E.Leclerc"),
    ("LEADER PRICE", "Leader Price"),
    ("CARREFOUR MARKET", "Carrefour Market"),
    ("CARREFOUR EXPRESS", "Carrefour Express"),
    ("CARREFOUR", "Carrefour"),
    ("AUCHAN", "Auchan"),
    ("RUN MARKET", "Run Market"),
    ("RUNMARKET", "Run Market"),
    ("INTERMARCHE", "Intermarché"),
    ("SUPER U", "Super U"),
    ("HYPER U", "Hyper U"),
    ("U EXPRESS", "U Express"),
    ("LIDL", "Lidl"),
    ("ALDI", "Aldi"),
    ("PICARD", "Picard"),
    ("MONOPRIX", "Monoprix"),
    ("FRANPRIX", "Franprix"),
    ("SPAR", "Spar"),
    ("CASINO", "Casino"),
)

_ITEM_START_MARKERS = (
    "OPERATION VENTE",
    "OPERATION : VENTE",
    "DETAIL DES ACHATS",
    "DETAIL ARTICLES",
    "DESIGNATION",
    "LIBELLE",
    "ARTICLES",
)

_NON_ITEM_PREFIXES = (
    "CAISSE",
    "TICKET",
    "TOTAL",
    "SOUS TOTAL",
    "SOUS-TOTAL",
    "CB",
    "CARTE",
    "ESPECES",
    "CHEQUE",
    "RENDU",
    "MONNAIE",
    "PAIEMENT",
    "CODE",
    "HT",
    "TVA",
    "TUA",
    "TTC",
    "NOMBRE ARTICLES",
    "NB ARTICLES",
    "NBR ARTICLES",
    "OPERATION",
    "BIENVENUE",
    "MERCI",
    "FIDELITE",
    "SOLDE DE POINTS",
    "PRIX PROMOTION",
)

_FINAL_PAYABLE_LABELS = (
    "RESTE A PAYER",
    "NET A PAYER",
    "TOTAL A PAYER",
    "MONTANT A PAYER",
    "MONTANT DU",
    "A PAYER",
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
_PAYMENT_OR_CHANGE_LABELS = (
    "ESPECES",
    "CARTE BLEUE",
    "CARTE BANCAIRE",
    "CB",
    "CHEQUE",
    "RENDU",
    "MONNAIE",
    "PAIEMENT",
)
_TOTAL_EXCLUDED_LABELS = (
    "SOUS TOTAL",
    "SOUS-TOTAL",
    "TOTAL TVA",
    "TOTAL HT",
    "TOTAL REMISE",
    "TOTAL ECONOMIE",
    "TOTAL AVANTAGE",
    "TOTAL FIDELITE",
)

# Corrections lexicales volontairement limitées à des mots génériques de
# l'alimentaire et des rayons. Les marques et désignations inconnues ne sont
# jamais corrigées par approximation.
_COMMON_PRODUCT_LEXICON = frozenset(
    {
        "ALIMENTAIRE",
        "AMANDES",
        "BANANE",
        "BANANES",
        "BOEUF",
        "BOUCHERIE",
        "BOULANGERIE",
        "CAROTTE",
        "CAROTTES",
        "CHARCUTERIE",
        "CHOCOLAT",
        "COUPE",
        "CREMERIE",
        "EPICERIE",
        "FROMAGERIE",
        "FOURRES",
        "GRILLEES",
        "OIGNON",
        "OIGNONS",
        "ORANGE",
        "ORANGES",
        "PATISSERIE",
        "POISSONNERIE",
        "POMME",
        "POMMES",
        "PORC",
        "POUDRE",
        "POULET",
        "PUREE",
        "TOMATE",
        "TOMATES",
    }
)

_GENERIC_NON_SPECIFIC_PRODUCT_PATTERNS = (
    re.compile(r"^BOUCHERIE\s+COUPE$", re.IGNORECASE),
    re.compile(r"^CHARCUTERIE\s+COUPE$", re.IGNORECASE),
    re.compile(r"^POISSONNERIE\s+COUPE$", re.IGNORECASE),
)

ITEM_REVIEW_CONFIDENCE_THRESHOLD = 0.88


def _ascii_fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        char for char in normalized if not unicodedata.combining(char)
    )


def _normalized_upper(value: str) -> str:
    return re.sub(r"\s+", " ", _ascii_fold(value).upper()).strip()


def _decimal(value: str | float | int | None) -> Decimal | None:
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


def _decimal_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _decimal_measure(
    value: str | float | int | None,
    scale: str = "0.001",
) -> Decimal | None:
    if value is None:
        return None
    cleaned = str(value).strip().replace(" ", "").replace(",", ".")
    try:
        return Decimal(cleaned).quantize(
            Decimal(scale),
            rounding=ROUND_HALF_UP,
        )
    except InvalidOperation:
        return None


def _join_tokens(tokens: Iterable[OCRToken]) -> str:
    ordered = sorted(
        tokens,
        key=lambda token: (token.box.x_min, token.index),
    )
    return " ".join(
        token.text.strip() for token in ordered if token.text.strip()
    ).strip()


def _parse_money_tokens(tokens: Iterable[OCRToken]) -> Decimal | None:
    for token in sorted(
        tokens,
        key=lambda item: (item.box.x_min, item.index),
    ):
        match = _MONEY_RE.search(token.text)
        if match:
            parsed = _decimal(match.group(1))
            if parsed is not None:
                return parsed
    return None


def _parse_line_money(line: ReconstructedLine) -> Decimal | None:
    price_tokens = [
        token for token in line.tokens if token.column == "price"
    ]
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
    cleaned = re.sub(r"^\s*[*•·]+\s*", "", value)
    cleaned = re.sub(r"^\s*\(\d\)\s*\d{4,14}\s*", "", cleaned)
    cleaned = _BARCODE_RE.sub(" ", cleaned)
    cleaned = re.sub(r"^\s*\(\d\)\s*", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:;")
    return cleaned


def _is_section_header(value: str) -> bool:
    return bool(re.match(r"^\s*(?:>>|»|›)\s*\S+", value))


def _clean_section_header(value: str) -> str:
    return re.sub(r"^\s*(?:>>|»|›)\s*", "", value).strip()


def _line_confidence(tokens: Iterable[OCRToken]) -> float:
    scores = [float(token.score) for token in tokens]
    return round(min(scores), 6) if scores else 0.0


def _declared_item_count_from_text(value: str) -> int | None:
    for pattern in _DECLARED_ITEMS_PATTERNS:
        match = pattern.search(value)
        if match:
            return int(match.group(1))
    return None


def _is_financial_summary(normalized: str) -> bool:
    if any(label in normalized for label in _FINAL_PAYABLE_LABELS):
        return True
    if any(
        normalized.startswith(label)
        for label in _PAYMENT_OR_CHANGE_LABELS
    ):
        return True
    if normalized.startswith("TOTAL"):
        return True
    if normalized.startswith(
        ("NOMBRE ARTICLES", "NB ARTICLES", "NBR ARTICLES")
    ):
        return True
    return False


def _is_item_start_marker(normalized: str) -> bool:
    return any(marker in normalized for marker in _ITEM_START_MARKERS)


def _is_non_item_text(value: str) -> bool:
    normalized = _normalized_upper(value)
    if not normalized:
        return True
    if _is_financial_summary(normalized):
        return True
    if normalized.startswith(_NON_ITEM_PREFIXES):
        return True
    if _PHONE_RE.search(value) or _NUMERIC_DATE_RE.search(value):
        return True
    if normalized.startswith(
        ("TEL", "SIRET", "APE", "TVA INTRA", "ADRESSE")
    ):
        return True
    if normalized.startswith(
        ("VOUS AVEZ ETE RECU", "VOUS AVEZ ÉTÉ REÇU")
    ):
        return True
    if normalized in {"EUR", "EURO", "EUROS"}:
        return True
    return False


def _looks_like_product_line(
    description_text: str,
    line: ReconstructedLine,
    price: Decimal | None,
) -> bool:
    del line

    if price is None:
        return False
    cleaned = _strip_product_marker(description_text)
    if not cleaned or _is_non_item_text(cleaned):
        return False
    normalized = _normalized_upper(cleaned)
    if any(label in normalized for label in _IMMEDIATE_DISCOUNT_LABELS):
        return False
    letters = re.sub(r"[^A-Z]", "", normalized)
    return len(letters) >= 2


def _normalize_weight_detail_ocr(value: str) -> str:
    """
    Corrige uniquement les confusions OCR qui apparaissent dans une expression
    de poids. Exemple réel : « 0.210 k9 x 1.80 EUR/kg ».

    Le remplacement est contextuel : un mot produit contenant « k9 » n'est
    jamais modifié.
    """
    normalized = value

    normalized = re.sub(
        r"(?P<weight>\d+[.,]\d+)\s*k(?:g|9|q|6|o)\b",
        lambda match: f"{match.group('weight')} kg",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"(?:EUR|€)\s*/?\s*k(?:g|9|q|6|o)\b",
        "EUR/kg",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _edit_distance_at_most_one(left: str, right: str) -> int:
    """
    Retourne 0, 1 ou 2. La valeur 2 signifie « plus d'une différence ».

    La fonction est volontairement limitée à une distance de 1 afin de ne pas
    transformer arbitrairement les marques ou les noms de produits.
    """
    if left == right:
        return 0
    if abs(len(left) - len(right)) > 1:
        return 2

    if len(left) == len(right):
        differences = sum(
            first != second
            for first, second in zip(left, right)
        )
        return 1 if differences == 1 else 2

    shorter, longer = (
        (left, right) if len(left) < len(right) else (right, left)
    )
    short_index = 0
    long_index = 0
    differences = 0

    while short_index < len(shorter) and long_index < len(longer):
        if shorter[short_index] == longer[long_index]:
            short_index += 1
            long_index += 1
            continue

        differences += 1
        if differences > 1:
            return 2
        long_index += 1

    return 1


def _correct_common_product_ocr(value: str) -> str:
    """
    Corrige une faute OCR seulement lorsqu'un token se trouve à une seule
    différence d'un mot générique connu, avec un candidat unique.

    Exemple réel : BOUCHERJE -> BOUCHERIE.

    Une marque ou une désignation inconnue est conservée telle quelle.
    """
    pieces = _WORD_TOKEN_RE.findall(value)
    corrected: list[str] = []

    for piece in pieces:
        folded = _normalized_upper(piece)
        if not folded or not folded.isalnum() or len(folded) < 5:
            corrected.append(piece)
            continue

        candidates = [
            word
            for word in _COMMON_PRODUCT_LEXICON
            if abs(len(word) - len(folded)) <= 1
            and _edit_distance_at_most_one(folded, word) <= 1
        ]

        if len(candidates) != 1:
            corrected.append(piece)
            continue

        target = candidates[0]
        if piece.isupper():
            corrected.append(target)
        elif piece[:1].isupper():
            corrected.append(target.capitalize())
        else:
            corrected.append(target.lower())

    return re.sub(r"\s+", " ", "".join(corrected)).strip()


def _is_generic_non_specific_product(value: str) -> bool:
    normalized = _normalized_upper(value)
    return any(
        pattern.fullmatch(normalized)
        for pattern in _GENERIC_NON_SPECIFIC_PRODUCT_PATTERNS
    )


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
            (
                Decimal(str(item.total_price))
                for item in self.items
            ),
            Decimal("0"),
        )
        return float(
            total.quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )
        )

    @property
    def counted_quantity(self) -> float:
        return float(
            sum(
                Decimal(str(item.quantity))
                for item in self.items
            )
        )

    @property
    def article_reconciliation_total(self) -> float | None:
        return (
            self.article_total
            if self.article_total is not None
            else self.total
        )

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
            json.dumps(
                self.to_dict(),
                ensure_ascii=False,
                indent=2,
            ),
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
    """Generic geometry-first parser for French retail receipts."""

    def parse(
        self,
        document: OCRDocument,
        lines: list[ReconstructedLine],
    ) -> ParsedReceipt:
        del document

        store_name = self._extract_store_name(lines)
        store_location = self._extract_store_location(
            lines,
            store_name,
        )
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
                token
                for token in line.tokens
                if token.column in {"description", "detail"}
            ]
            price_tokens = [
                token for token in line.tokens if token.column == "price"
            ]
            vat_tokens = [
                token for token in line.tokens if token.column == "vat"
            ]

            description_text = _join_tokens(description_tokens)
            line_text = line.text.strip()
            normalized = _normalized_upper(
                description_text or line_text
            )
            column_price = _parse_money_tokens(price_tokens)
            price = (
                column_price
                if column_price is not None
                else _parse_line_money(line)
            )
            vat_code = _parse_vat_code(vat_tokens)

            if _declared_item_count_from_text(line_text) is not None:
                if pending is not None:
                    warnings.append(
                        "Description sans prix avant le total: "
                        f"{pending.raw_name}"
                    )
                break

            if _is_section_header(description_text):
                item_area_started = True
                section = _clean_section_header(description_text)
                if section:
                    excluded_sections.append(section)
                pending = None
                continue

            if _is_item_start_marker(normalized):
                item_area_started = True
                pending = None
                continue

            if _is_financial_summary(normalized):
                if item_area_started:
                    pending = None
                continue

            detail_text = _normalize_weight_detail_ocr(
                description_text or line_text
            )
            weight_match = _WEIGHT_RE.search(detail_text)
            detail_match = (
                None
                if weight_match is not None
                else _MULTIBUY_RE.search(detail_text)
            )

            if detail_match or weight_match:
                item_area_started = True

                if pending is not None and column_price is not None:
                    item = self._item_from_detail(
                        pending=pending,
                        line=line,
                        detail_text=detail_text,
                        price=column_price,
                        vat_code=vat_code,
                        detail_match=detail_match,
                        weight_match=weight_match,
                    )
                    items.append(item)
                    pending = None
                    continue

                if items and column_price is None:
                    self._apply_detail_to_previous_item(
                        item=items[-1],
                        line=line,
                        detail_text=detail_text,
                        detail_match=detail_match,
                        weight_match=weight_match,
                        warnings=warnings,
                    )
                    continue

                warnings.append(
                    "Ligne secondaire sans désignation exploitable "
                    f"(ligne {line.line_id}): {detail_text}"
                )
                continue

            if _looks_like_product_line(
                description_text,
                line,
                price,
            ):
                item_area_started = True

            if not item_area_started:
                continue

            if not description_text:
                continue

            if _is_non_item_text(description_text):
                continue

            cleaned_name = _correct_common_product_ocr(
                _strip_product_marker(description_text)
            )
            if not cleaned_name:
                continue

            if price is not None:
                if pending is not None:
                    warnings.append(
                        "Description sans ligne secondaire: "
                        f"{pending.raw_name}"
                    )
                    pending = None

                confidence = _line_confidence(line.tokens)
                generic_non_specific = (
                    _is_generic_non_specific_product(cleaned_name)
                )

                items.append(
                    ParsedReceiptItem(
                        raw_name=cleaned_name,
                        quantity=1.0,
                        unit_price=float(price),
                        total_price=float(price),
                        vat_code=vat_code,
                        item_type=(
                            "generic_department"
                            if generic_non_specific
                            else "standard"
                        ),
                        raw_detail=None,
                        weight_kg=None,
                        price_per_kg=None,
                        ocr_confidence=confidence,
                        source_line_ids=[line.line_id],
                        needs_review=(
                            confidence
                            < ITEM_REVIEW_CONFIDENCE_THRESHOLD
                            or generic_non_specific
                        ),
                    )
                )
                continue

            if _BARCODE_RE.fullmatch(description_text.strip()):
                continue

            if normalized.startswith(
                ("PRIX PROMOTION", "PROMOTION", "REMISE")
            ):
                continue

            if pending is not None:
                warnings.append(
                    "Description remplacée sans prix: "
                    f"{pending.raw_name}"
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
            and abs(
                parsed.items_total - reconciliation_total
            ) > 0.02
        ):
            parsed.warnings.append(
                "Somme des articles "
                f"{parsed.items_total:.2f} != total articles "
                f"{reconciliation_total:.2f}"
            )

        if (
            parsed.declared_item_count is not None
            and abs(
                parsed.counted_quantity
                - parsed.declared_item_count
            ) > 0.001
        ):
            parsed.warnings.append(
                "Quantité reconstruite "
                f"{parsed.counted_quantity:g} != nombre déclaré "
                f"{parsed.declared_item_count}"
            )

        return parsed

    @staticmethod
    def _item_from_detail(
        *,
        pending: _PendingDescription,
        line: ReconstructedLine,
        detail_text: str,
        price: Decimal,
        vat_code: int | None,
        detail_match: re.Match[str] | None,
        weight_match: re.Match[str] | None,
    ) -> ParsedReceiptItem:
        combined_tokens = pending.tokens + line.tokens
        confidence = _line_confidence(combined_tokens)
        generic_non_specific = _is_generic_non_specific_product(
            pending.raw_name
        )

        if weight_match:
            weight = _decimal_measure(
                weight_match.group("weight")
            )
            price_per_kg = _decimal(
                weight_match.group("price_per_kg")
            )
            arithmetic_total = (
                weight * price_per_kg
                if weight is not None
                and price_per_kg is not None
                else None
            )
            arithmetic_ok = (
                arithmetic_total is not None
                and abs(arithmetic_total - price)
                <= Decimal("0.02")
            )

            return ParsedReceiptItem(
                raw_name=pending.raw_name,
                quantity=1.0,
                unit_price=None,
                total_price=float(price),
                vat_code=vat_code,
                item_type=(
                    "generic_department"
                    if generic_non_specific
                    else "weight"
                ),
                raw_detail=detail_text,
                weight_kg=_decimal_float(weight),
                price_per_kg=_decimal_float(price_per_kg),
                ocr_confidence=confidence,
                source_line_ids=[
                    pending.line_id,
                    line.line_id,
                ],
                needs_review=(
                    confidence
                    < ITEM_REVIEW_CONFIDENCE_THRESHOLD
                    or not arithmetic_ok
                    or generic_non_specific
                ),
            )

        assert detail_match is not None
        quantity = int(detail_match.group("quantity"))
        unit_price = _decimal(
            detail_match.group("unit_price")
        )
        expected_total = (
            unit_price * Decimal(quantity)
            if unit_price is not None
            else None
        )
        arithmetic_ok = (
            expected_total is not None
            and abs(expected_total - price)
            <= Decimal("0.02")
        )

        return ParsedReceiptItem(
            raw_name=pending.raw_name,
            quantity=float(quantity),
            unit_price=_decimal_float(unit_price),
            total_price=float(price),
            vat_code=vat_code,
            item_type=(
                "generic_department"
                if generic_non_specific
                else "multibuy"
            ),
            raw_detail=detail_text,
            weight_kg=None,
            price_per_kg=None,
            ocr_confidence=confidence,
            source_line_ids=[
                pending.line_id,
                line.line_id,
            ],
            needs_review=(
                confidence
                < ITEM_REVIEW_CONFIDENCE_THRESHOLD
                or not arithmetic_ok
                or generic_non_specific
            ),
        )

    @staticmethod
    def _apply_detail_to_previous_item(
        *,
        item: ParsedReceiptItem,
        line: ReconstructedLine,
        detail_text: str,
        detail_match: re.Match[str] | None,
        weight_match: re.Match[str] | None,
        warnings: list[str],
    ) -> None:
        item.raw_detail = detail_text
        item.source_line_ids = [
            *item.source_line_ids,
            line.line_id,
        ]
        item.ocr_confidence = min(
            item.ocr_confidence,
            _line_confidence(line.tokens),
        )
        item.needs_review = (
            item.needs_review
            or item.ocr_confidence
            < ITEM_REVIEW_CONFIDENCE_THRESHOLD
            or _is_generic_non_specific_product(item.raw_name)
        )

        if weight_match:
            weight = _decimal_measure(
                weight_match.group("weight")
            )
            price_per_kg = _decimal(
                weight_match.group("price_per_kg")
            )
            item.item_type = (
                "generic_department"
                if _is_generic_non_specific_product(item.raw_name)
                else "weight"
            )
            item.quantity = 1.0
            item.unit_price = None
            item.weight_kg = _decimal_float(weight)
            item.price_per_kg = _decimal_float(price_per_kg)

            arithmetic_total = (
                weight * price_per_kg
                if weight is not None
                and price_per_kg is not None
                else None
            )
            if (
                arithmetic_total is None
                or abs(
                    arithmetic_total
                    - Decimal(str(item.total_price))
                ) > Decimal("0.02")
            ):
                item.needs_review = True
                warnings.append(
                    "Calcul poids/prix incohérent pour "
                    f"{item.raw_name}"
                )
            return

        assert detail_match is not None
        quantity = int(detail_match.group("quantity"))
        unit_price = _decimal(
            detail_match.group("unit_price")
        )
        item.item_type = (
            "generic_department"
            if _is_generic_non_specific_product(item.raw_name)
            else "multibuy"
        )
        item.quantity = float(quantity)
        item.unit_price = _decimal_float(unit_price)

        expected_total = (
            unit_price * Decimal(quantity)
            if unit_price is not None
            else None
        )
        if (
            expected_total is None
            or abs(
                expected_total
                - Decimal(str(item.total_price))
            ) > Decimal("0.02")
        ):
            item.needs_review = True
            warnings.append(
                "Calcul quantité/prix incohérent pour "
                f"{item.raw_name}"
            )

    @staticmethod
    def _extract_store_name(
        lines: list[ReconstructedLine],
    ) -> str | None:
        for line in lines[:12]:
            text = line.text.strip()
            normalized = _normalized_upper(text)
            for signal, canonical in _STORE_CANONICAL_NAMES:
                if signal in normalized:
                    return canonical

        for line in lines[:8]:
            text = _strip_product_marker(line.text.strip())
            normalized = _normalized_upper(text)
            if not text or _is_non_item_text(text):
                continue
            if _POSTCODE_RE.search(text) or normalized.startswith(
                ("RUE ", "AVENUE ", "CHEMIN ", "BOULEVARD ")
            ):
                continue
            return text
        return None

    @staticmethod
    def _extract_store_location(
        lines: list[ReconstructedLine],
        store_name: str | None,
    ) -> str | None:
        if not store_name:
            return None

        store_normalized = _normalized_upper(store_name)

        for line in lines[:10]:
            text = line.text.strip()
            normalized = _normalized_upper(text)
            if not text:
                continue

            if store_normalized == "LEADER PRICE":
                if normalized in {"LEADER", "PRICE"}:
                    continue
                if "LEADER PRICE" in normalized:
                    suffix = re.sub(
                        r"^.*?LEADER\s+PRICE\s*",
                        "",
                        normalized,
                    ).strip(" -:")
                    if suffix:
                        return suffix.title()
                    continue

            matching_store_line = any(
                signal in normalized
                for signal, canonical in _STORE_CANONICAL_NAMES
                if _normalized_upper(canonical) == store_normalized
            )
            if matching_store_line:
                continue
            if _PHONE_RE.search(text) or _NUMERIC_DATE_RE.search(text):
                continue
            if normalized.startswith(
                (
                    "TEL",
                    "BIENVENUE",
                    "VOUS AVEZ",
                    "CAISSE",
                    "TICKET",
                    "OPERATION",
                )
            ):
                continue
            if _POSTCODE_RE.search(text):
                city = re.sub(
                    r".*?\b\d{5}\b",
                    "",
                    text,
                ).strip(" ,-")
                if city:
                    return city.title()
                continue
            if normalized.startswith(
                ("RUE ", "AVENUE ", "CHEMIN ", "BOULEVARD ")
            ):
                continue
            return text
        return None

    @staticmethod
    def _extract_date(
        lines: list[ReconstructedLine],
    ) -> str | None:
        for line in lines[:18]:
            text = line.text

            textual = _TEXTUAL_DATE_RE.search(text)
            if textual:
                month_key = _ascii_fold(
                    textual.group("month").lower()
                )
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
    def _extract_time(
        lines: list[ReconstructedLine],
    ) -> str | None:
        for line in lines[:18]:
            match = _TIME_RE.search(line.text)
            if match:
                return match.group(0)
        return None

    @staticmethod
    def _extract_declared_item_count(
        lines: list[ReconstructedLine],
    ) -> int | None:
        for line in lines:
            parsed = _declared_item_count_from_text(line.text)
            if parsed is not None:
                return parsed
        return None

    @staticmethod
    def _extract_total(
        lines: list[ReconstructedLine],
    ) -> float | None:
        return ReceiptParserFR._extract_totals(lines).total

    @staticmethod
    def _extract_totals(
        lines: list[ReconstructedLine],
    ) -> _ReceiptTotals:
        article_total = ReceiptParserFR._extract_article_total(lines)
        payable_total = ReceiptParserFR._extract_payable_total(lines)
        immediate_discount_total = (
            ReceiptParserFR._extract_immediate_discount_total(lines)
        )
        warnings: list[str] = []

        computed_payable = None
        if (
            article_total is not None
            and immediate_discount_total is not None
        ):
            computed_payable = (
                article_total - immediate_discount_total
            )

        if payable_total is not None:
            if (
                computed_payable is not None
                and abs(
                    payable_total - computed_payable
                ) > 0.02
            ):
                warnings.append(
                    "Total final contradictoire avec la remise "
                    "immediate; validation manuelle requise"
                )
                return _ReceiptTotals(
                    total=None,
                    article_total=article_total,
                    immediate_discount_total=(
                        immediate_discount_total
                    ),
                    payable_total=payable_total,
                    warnings=warnings,
                )
            return _ReceiptTotals(
                total=payable_total,
                article_total=article_total,
                immediate_discount_total=(
                    immediate_discount_total
                ),
                payable_total=payable_total,
                warnings=warnings,
            )

        if computed_payable is not None:
            return _ReceiptTotals(
                total=round(computed_payable, 2),
                article_total=article_total,
                immediate_discount_total=(
                    immediate_discount_total
                ),
                payable_total=round(computed_payable, 2),
                warnings=warnings,
            )

        return _ReceiptTotals(
            total=article_total,
            article_total=article_total,
            immediate_discount_total=(
                immediate_discount_total
            ),
            payable_total=None,
            warnings=warnings,
        )

    @staticmethod
    def _extract_article_total(
        lines: list[ReconstructedLine],
    ) -> float | None:
        for index, line in enumerate(lines):
            if _declared_item_count_from_text(line.text) is None:
                continue

            total = _parse_line_money(line)
            if total is not None:
                return float(total)

            declared_height = max(
                1.0,
                line.y_max - line.y_min,
            )
            max_vertical_gap = max(
                45.0,
                declared_height * 1.8,
            )
            for candidate in lines[index + 1:index + 3]:
                vertical_gap = (
                    candidate.center_y - line.center_y
                )
                if vertical_gap < 0:
                    continue
                if vertical_gap > max_vertical_gap:
                    break
                normalized = _normalized_upper(
                    candidate.text
                )
                if any(
                    normalized.startswith(label)
                    for label in _PAYMENT_OR_CHANGE_LABELS
                ):
                    break
                candidate_total = _parse_line_money(
                    candidate
                )
                if candidate_total is not None:
                    return float(candidate_total)

        candidates: list[float] = []
        for line in lines:
            normalized = _normalized_upper(line.text)
            if not normalized.startswith("TOTAL"):
                continue
            if any(
                label in normalized
                for label in _TOTAL_EXCLUDED_LABELS
            ):
                continue
            if any(
                label in normalized
                for label in _FINAL_PAYABLE_LABELS
            ):
                continue
            parsed = _parse_line_money(line)
            if parsed is not None:
                candidates.append(float(parsed))

        return candidates[-1] if candidates else None

    @staticmethod
    def _extract_payable_total(
        lines: list[ReconstructedLine],
    ) -> float | None:
        candidates: list[float] = []
        for line in lines:
            normalized = _normalized_upper(line.text)
            if not any(
                label in normalized
                for label in _FINAL_PAYABLE_LABELS
            ):
                continue
            parsed = _parse_line_money(line)
            if parsed is not None:
                candidates.append(float(parsed))
        return candidates[-1] if candidates else None

    @staticmethod
    def _extract_immediate_discount_total(
        lines: list[ReconstructedLine],
    ) -> float | None:
        discounts: list[Decimal] = []

        for line in lines:
            normalized = _normalized_upper(line.text)
            if any(
                label in normalized
                for label in _FUTURE_BON_LABELS
            ):
                continue
            if not any(
                label in normalized
                for label in _IMMEDIATE_DISCOUNT_LABELS
            ):
                continue
            parsed = _parse_line_money(line)
            if parsed is not None:
                discounts.append(abs(parsed))

        if not discounts:
            return None

        total = sum(
            discounts,
            Decimal("0"),
        ).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        return float(total)
