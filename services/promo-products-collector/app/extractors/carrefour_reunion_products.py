from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit

from app.services.retail_product_normalization import clean_text


PRICE_INTEGER_CLASSES = {"price-cross", "text-price-red"}
NATIVE_ID_ATTRIBUTES = (
    "data-product-id",
    "data-product_id",
    "data-sku",
    "data-ean",
    "data-gtin",
    "data-reference",
    "data-ref",
)
PACKAGE_MULTIPACK_RE = re.compile(
    r"\b\d+\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|mg|l|cl|ml)\b",
    re.IGNORECASE,
)
PACKAGE_DIMENSIONS_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?(?:\s*[xX]\s*\d+(?:[.,]\d+)?){1,3}\s*cm\b",
    re.IGNORECASE,
)
PACKAGE_SIMPLE_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|mg|l|cl|ml)\b",
    re.IGNORECASE,
)
PACKAGE_COUNT_RE = re.compile(
    r"\b(?:x\s*\d+|\d+\s*(?:doses?|pi[eè]ces?|unit[eé]s?|sachets?|rouleaux?|capsules?|bouteilles?))\b",
    re.IGNORECASE,
)
UNIT_PRICE_RE = re.compile(
    r"\b(?:la|le)\s+(?P<unit>dose|kg|kilogramme|litre|l)\s*:\s*(?P<value>\d+(?:[.,]\d+)?)\s*€",
    re.IGNORECASE,
)


@dataclass
class HtmlNode:
    tag: str
    attrs: dict[str, str]
    parent: HtmlNode | None = None
    children: list[HtmlNode] = field(default_factory=list)
    text_chunks: list[str] = field(default_factory=list)

    @property
    def classes(self) -> set[str]:
        return {item for item in self.attrs.get("class", "").split() if item}

    def attr(self, name: str) -> str | None:
        value = self.attrs.get(name)
        return clean_text(value) or None

    def text(self) -> str:
        values: list[str] = []

        def visit(node: HtmlNode) -> None:
            values.extend(node.text_chunks)
            for child in node.children:
                visit(child)

        visit(self)
        return clean_text(" ".join(values))

    def descendants(self, *, include_self: bool = False) -> list[HtmlNode]:
        found: list[HtmlNode] = [self] if include_self else []
        for child in self.children:
            found.append(child)
            found.extend(child.descendants())
        return found

    def find_all(self, *, tag: str | None = None, class_name: str | None = None) -> list[HtmlNode]:
        return [
            node
            for node in self.descendants(include_self=True)
            if (tag is None or node.tag == tag)
            and (class_name is None or class_name in node.classes)
        ]

    def find_first(self, *, tag: str | None = None, class_name: str | None = None) -> HtmlNode | None:
        matches = self.find_all(tag=tag, class_name=class_name)
        return matches[0] if matches else None


class _TreeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = HtmlNode(tag="document", attrs={})
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = HtmlNode(
            tag=tag.lower(),
            attrs={name.lower(): value or "" for name, value in attrs},
            parent=self.stack[-1],
        )
        self.stack[-1].children.append(node)
        if tag.lower() not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag.lower():
            self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        normalized = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == normalized:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if data:
            self.stack[-1].text_chunks.append(data)


@dataclass(frozen=True)
class CarrefourIdentityAudit:
    native_source_id: str | None
    native_source_kind: str | None
    dom_id_candidates: tuple[str, ...]
    data_attribute_candidates: tuple[str, ...]
    hidden_value_candidates: tuple[str, ...]
    link_candidates: tuple[str, ...]
    json_candidates: tuple[str, ...]
    aria_title_candidates: tuple[str, ...]
    image_asset_key: str | None
    canonical_image_url: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "native_source_id": self.native_source_id,
            "native_source_kind": self.native_source_kind,
            "dom_id_candidates": list(self.dom_id_candidates),
            "data_attribute_candidates": list(self.data_attribute_candidates),
            "hidden_value_candidates": list(self.hidden_value_candidates),
            "link_candidates": list(self.link_candidates),
            "json_candidates": list(self.json_candidates),
            "aria_title_candidates": list(self.aria_title_candidates),
            "image_asset_key": self.image_asset_key,
            "canonical_image_url": self.canonical_image_url,
        }


@dataclass(frozen=True)
class CarrefourProductCard:
    source_url: str
    retailer_slug: str
    retailer_name: str
    raw_product_name: str
    brand: str | None
    description: str | None
    package_format: str | None
    current_price: float | None
    original_price: float | None
    unit_price: float | None
    unit_price_unit: str | None
    promotion_proven: bool
    promotion_evidence: str | None
    offer_mechanism: str | None
    discount_percent: float | None
    conditions: str | None
    image_url: str | None
    identity_audit: CarrefourIdentityAudit
    ambiguity_reasons: tuple[str, ...]


@dataclass(frozen=True)
class CarrefourPageAudit:
    source_url: str
    cards: list[CarrefourProductCard]
    json_ld_blocks: int
    hidden_json_blocks: int
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "source_url": self.source_url,
            "cards_detected": len(self.cards),
            "json_ld_blocks": self.json_ld_blocks,
            "hidden_json_blocks": self.hidden_json_blocks,
            "errors": list(self.errors),
        }


def parse_carrefour_page(
    html_text: str,
    *,
    source_url: str,
    expected_retailer_slug: str | None = None,
) -> CarrefourPageAudit:
    parser = _TreeParser()
    parser.feed(html_text)
    parser.close()
    errors: list[str] = []
    cards: list[CarrefourProductCard] = []
    for node in parser.root.find_all(class_name="discount"):
        designation = node.find_first(class_name="designation")
        if designation is None or not designation.text():
            continue
        try:
            card = _parse_card(node, source_url=source_url)
            if expected_retailer_slug and card.retailer_slug != expected_retailer_slug:
                errors.append(
                    f"unexpected_retailer_scope:{card.retailer_slug}:{card.raw_product_name}"
                )
                continue
            cards.append(card)
        except Exception as exc:
            errors.append(f"card_parse_error:{designation.text()}:{exc}")

    json_ld_blocks = len(
        [
            node
            for node in parser.root.find_all(tag="script")
            if (node.attr("type") or "").lower() == "application/ld+json"
        ]
    )
    hidden_json_blocks = len(
        [
            node
            for node in parser.root.find_all(tag="script")
            if "json" in (node.attr("type") or "").lower()
        ]
    )
    return CarrefourPageAudit(
        source_url=source_url,
        cards=cards,
        json_ld_blocks=json_ld_blocks,
        hidden_json_blocks=hidden_json_blocks,
        errors=tuple(errors),
    )


def canonical_image_url(value: str | None) -> str | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None
    parsed = urlsplit(cleaned)
    if not parsed.scheme or not parsed.netloc:
        return cleaned.split("?", 1)[0]
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, "", ""))


def image_asset_key(value: str | None) -> str | None:
    canonical = canonical_image_url(value)
    if not canonical:
        return None
    path = urlsplit(canonical).path.strip("/")
    marker = "glide/local/attachments/"
    if marker in path:
        return path.split(marker, 1)[1]
    return path or None


def extract_package_format(description: str | None, product_name: str | None) -> str | None:
    description_text = clean_text(description)
    product_text = clean_text(product_name)
    for pattern in (PACKAGE_DIMENSIONS_RE, PACKAGE_MULTIPACK_RE):
        match = pattern.search(description_text)
        if match:
            return clean_text(match.group(0))

    dose_match = re.search(r"\b\d+\s*doses?\b", description_text, re.IGNORECASE)
    simple_matches = list(PACKAGE_SIMPLE_RE.finditer(description_text))
    if dose_match and simple_matches:
        return f"{clean_text(dose_match.group(0))}; {clean_text(simple_matches[-1].group(0))}"
    if simple_matches:
        return clean_text(simple_matches[-1].group(0))

    count_match = PACKAGE_COUNT_RE.search(description_text)
    if count_match:
        return clean_text(count_match.group(0))
    count_match = PACKAGE_COUNT_RE.search(product_text)
    if count_match:
        return clean_text(count_match.group(0))
    if re.search(r"\bquattro\s+pack\b", description_text, re.IGNORECASE):
        return "Quattro Pack"
    return None


def parse_carrefour_unit_price(value: str | None) -> tuple[float | None, str | None]:
    match = UNIT_PRICE_RE.search(clean_text(value))
    if not match:
        return None, None
    unit = match.group("unit").lower()
    unit = {"dose": "unite", "kilogramme": "kg", "litre": "l"}.get(unit, unit)
    return round(float(match.group("value").replace(",", ".")), 2), unit


def _parse_card(node: HtmlNode, *, source_url: str) -> CarrefourProductCard:
    retailer_slug, retailer_name = _retailer_from_classes(node.classes)
    designation = _node_text(node.find_first(class_name="designation"))
    brand = _node_text(node.find_first(class_name="marks")) or None
    description = _node_text(node.find_first(class_name="description")) or None
    package_format = extract_package_format(description, designation)
    prices = [_price_from_node(item) for item in node.find_all(class_name="price")]
    prices = [item for item in prices if item[0] is not None]
    crossed = [price for price, is_crossed in prices if is_crossed]
    current = [price for price, is_crossed in prices if not is_crossed]
    original_price = crossed[0] if crossed else None
    current_price = current[-1] if current else (prices[-1][0] if prices else None)
    promotion_proven = bool(
        original_price is not None
        and current_price is not None
        and original_price > current_price
    )
    unit_price, unit_price_unit = parse_carrefour_unit_price(description)
    discount_percent = None
    if promotion_proven and original_price:
        discount_percent = round(((original_price - current_price) / original_price) * 100, 2)
    footer = _node_text(node.find_first(class_name="footer")) or None
    image = node.find_first(tag="img")
    image_url = image.attr("src") if image else None
    audit = _audit_identity(node, image_url=image_url)
    ambiguity: list[str] = []
    if not brand:
        ambiguity.append("missing_brand")
    if not package_format:
        ambiguity.append("missing_package_format")
    if "..." in clean_text(description):
        ambiguity.append("truncated_description")
    if not audit.native_source_id:
        ambiguity.append("synthetic_identity_required")
    return CarrefourProductCard(
        source_url=source_url,
        retailer_slug=retailer_slug,
        retailer_name=retailer_name,
        raw_product_name=designation,
        brand=brand,
        description=description,
        package_format=package_format,
        current_price=current_price,
        original_price=original_price,
        unit_price=unit_price,
        unit_price_unit=unit_price_unit,
        promotion_proven=promotion_proven,
        promotion_evidence="old_price_and_new_price" if promotion_proven else None,
        offer_mechanism="direct_discount" if promotion_proven else None,
        discount_percent=discount_percent,
        conditions=footer,
        image_url=image_url,
        identity_audit=audit,
        ambiguity_reasons=tuple(ambiguity),
    )


def _retailer_from_classes(classes: set[str]) -> tuple[str, str]:
    if "carrefour-market" in classes:
        return "carrefour-market-reunion", "Carrefour Market Réunion"
    if "carrefour-city" in classes:
        return "carrefour-city-reunion", "Carrefour City Réunion"
    if "carrefour" in classes:
        return "carrefour-reunion", "Carrefour Réunion"
    raise ValueError("missing_carrefour_retailer_scope")


def _price_from_node(node: HtmlNode) -> tuple[float | None, bool]:
    integer_node = next(
        (
            item
            for item in node.descendants(include_self=True)
            if item.classes.intersection(PRICE_INTEGER_CLASSES)
            and re.fullmatch(r"\d+", item.text())
        ),
        None,
    )
    cents_node = node.find_first(class_name="cents")
    if integer_node is None:
        return None, False
    integer = integer_node.text()
    cents = re.sub(r"\D", "", cents_node.text()) if cents_node else ""
    value = round(float(f"{integer}.{cents or '00'}"), 2)
    return value, "price-cross" in integer_node.classes


def _audit_identity(node: HtmlNode, *, image_url: str | None) -> CarrefourIdentityAudit:
    nodes = node.descendants(include_self=True)
    dom_ids = sorted({value for item in nodes if (value := item.attr("id"))})
    data_attrs = sorted(
        {
            f"{name}={clean_text(value)}"
            for item in nodes
            for name, value in item.attrs.items()
            if name.startswith("data-") and clean_text(value)
        }
    )
    hidden_values = sorted(
        {
            f"{item.attr('name') or 'hidden'}={item.attr('value')}"
            for item in nodes
            if item.tag == "input"
            and (item.attr("type") or "").lower() == "hidden"
            and item.attr("value")
        }
    )
    links = sorted(
        {
            value
            for item in nodes
            if item.tag == "a"
            and (value := item.attr("href"))
            and value.lower() not in {"javascript:", "#"}
        }
    )
    json_candidates: list[str] = []
    for item in nodes:
        if item.tag != "script" or "json" not in (item.attr("type") or "").lower():
            continue
        payload = item.text()
        if payload:
            try:
                json.loads(payload)
                json_candidates.append(payload)
            except json.JSONDecodeError:
                json_candidates.append(payload)
    aria_titles = sorted(
        {
            f"{name}={clean_text(value)}"
            for item in nodes
            for name, value in item.attrs.items()
            if name in {"aria-label", "title"} and clean_text(value)
        }
    )

    native_id = None
    native_kind = None
    for item in nodes:
        for name in NATIVE_ID_ATTRIBUTES:
            if value := item.attr(name):
                native_id, native_kind = value, name
                break
        if native_id:
            break
    if not native_id:
        for item in nodes:
            value = item.attr("id")
            if value and re.search(r"(?:product|produit|sku|ean|gtin|article)", value, re.IGNORECASE):
                native_id, native_kind = value, "dom_id"
                break

    return CarrefourIdentityAudit(
        native_source_id=native_id,
        native_source_kind=native_kind,
        dom_id_candidates=tuple(dom_ids),
        data_attribute_candidates=tuple(data_attrs),
        hidden_value_candidates=tuple(hidden_values),
        link_candidates=tuple(links),
        json_candidates=tuple(json_candidates),
        aria_title_candidates=tuple(aria_titles),
        image_asset_key=image_asset_key(image_url),
        canonical_image_url=canonical_image_url(image_url),
    )


def _node_text(node: HtmlNode | None) -> str:
    return node.text() if node else ""
