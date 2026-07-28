from __future__ import annotations

import json
import re
from dataclasses import dataclass
from html import unescape
from urllib.parse import parse_qs, urlsplit

from app.services.retail_product_normalization import clean_text, parse_price, parse_unit_price


STORE_JSON_RE = re.compile(r'<script type="text/json" data-source>(?P<payload>.*?)</script>', re.S)
CATEGORY_SECTION_RE = re.compile(
    r"<label[^>]*>\s*.*?<span>(?P<category>[^<]+)</span>.*?</label>\s*<ul class=\"items\">(?P<body>.*?)</ul>",
    re.S,
)
CATEGORY_LINK_RE = re.compile(r'<a href="(?P<href>https://leaderdrive\.re/[^"]+/articles/[^"]+)"[^>]*>(?P<label>.*?)</a>', re.S)
PRODUCT_CARD_START_RE = re.compile(r'<span class="card product-card" id="product-card-(?P<card_id>\d+)">')
PRICE_BLOCK_RE = re.compile(r'<p class="product-price">\s*(?P<body>.*?)</p>', re.S)
PRICE_VALUE_RE = re.compile(
    r'<span class="price"><span class="int">(?P<int>\d+)</span>\s*<span><span class="cents">(?P<cents>\d{2})</span>',
    re.S,
)
PRODUCT_PAGE_HEADING_RE = re.compile(r'<h1[^>]*>\s*(?P<title>.*?)\s*</h1>', re.S)


@dataclass(frozen=True)
class LeaderDriveStore:
    id: int
    name: str
    city: str
    postcode: str | None
    slug: str
    url: str


@dataclass(frozen=True)
class LeaderDriveCategory:
    category: str
    subcategory: str
    url: str
    slug: str


@dataclass(frozen=True)
class LeaderDriveProductCard:
    card_id: str
    page_url: str
    product_url: str
    brand: str | None
    product_label: str
    product_content: str | None
    image_url: str | None
    current_price: float | None
    original_price: float | None
    unit_price: float | None
    unit_price_unit: str | None
    promotion_badge: str | None
    promotion_evidence: str | None
    offer_mechanism: str | None
    discount_percent: float | None
    loyalty_amount: float | None
    loyalty_type: str | None
    availability_status: str | None
    raw_block: str


@dataclass(frozen=True)
class LeaderDriveDetail:
    product_url: str
    brand: str | None
    title: str | None
    package_format: str | None
    unit_price: float | None
    unit_price_unit: str | None
    current_price: float | None
    image_url: str | None


@dataclass(frozen=True)
class LeaderDrivePageAudit:
    url: str
    category: str | None
    subcategory: str | None
    page_number: int
    estimated_total_products: int | None
    pagination_pages: list[int]
    cards: list[LeaderDriveProductCard]


def parse_public_stores(html_text: str) -> list[LeaderDriveStore]:
    match = STORE_JSON_RE.search(html_text)
    if not match:
        return []
    payload = json.loads(unescape(match.group("payload")))
    stores: list[LeaderDriveStore] = []
    for item in payload.values():
        store_id = int(item["id"])
        name = clean_text(item.get("name"))
        city = clean_text(item.get("city"))
        postcode = clean_text(item.get("postcode")) or None
        slug = _store_slug_from_name(name)
        stores.append(
            LeaderDriveStore(
                id=store_id,
                name=name,
                city=city,
                postcode=postcode,
                slug=slug,
                url=f"https://leaderdrive.re/{slug}",
            )
        )
    stores.sort(key=lambda item: item.id)
    return stores


def choose_pilot_store(stores: list[LeaderDriveStore]) -> LeaderDriveStore:
    if not stores:
        raise ValueError("no_public_store_available")

    preferred_slugs = [
        "leaderprice-lp-saint-leu",
        "leaderprice-lp-ermitage",
        "leaderprice-lp-chaussee-royale",
        "leaderprice-lp-possession",
    ]
    by_slug = {store.slug: store for store in stores}
    for slug in preferred_slugs:
        if slug in by_slug:
            return by_slug[slug]
    return stores[0]


def parse_store_categories(html_text: str) -> list[LeaderDriveCategory]:
    categories: list[LeaderDriveCategory] = []
    for match in CATEGORY_SECTION_RE.finditer(html_text):
        category = _strip_tags(match.group("category")).upper()
        if category.startswith("LP "):
            continue
        body = match.group("body")
        for link_match in CATEGORY_LINK_RE.finditer(body):
            href = clean_text(link_match.group("href"))
            label = _strip_tags(link_match.group("label")).upper()
            slug = urlsplit(href).path.rstrip("/").rsplit("/", 1)[-1]
            categories.append(
                LeaderDriveCategory(
                    category=category,
                    subcategory=label,
                    url=href,
                    slug=slug,
                )
            )
    return categories


def select_representative_categories(categories: list[LeaderDriveCategory]) -> list[LeaderDriveCategory]:
    keywords = [
        "EPICERIE SALEE",
        "JUS DE FRUITS ET SIROPS",
        "CREMERIE",
        "HYGIENE, SOINS DU CORPS",
        "PRODUITS NETTOYANT",
    ]
    selected: list[LeaderDriveCategory] = []
    for keyword in keywords:
        for category in categories:
            if category.subcategory == keyword:
                selected.append(category)
                break
    return selected


def parse_product_list_page(
    html_text: str,
    *,
    page_url: str,
    category: str | None,
    subcategory: str | None,
) -> LeaderDrivePageAudit:
    cards = parse_product_cards(html_text, page_url=page_url)
    page_numbers = sorted({int(value) for value in re.findall(r"\?page=(\d+)", html_text)})
    current_page = int(parse_qs(urlsplit(page_url).query).get("page", ["1"])[0])
    if current_page not in page_numbers:
        page_numbers = sorted({current_page, *page_numbers})
    total_products_match = re.search(r"(\d+)\s+produits", html_text, re.I)
    estimated_total_products = int(total_products_match.group(1)) if total_products_match else None
    return LeaderDrivePageAudit(
        url=page_url,
        category=category,
        subcategory=subcategory,
        page_number=current_page,
        estimated_total_products=estimated_total_products,
        pagination_pages=page_numbers,
        cards=cards,
    )


def parse_product_cards(html_text: str, *, page_url: str) -> list[LeaderDriveProductCard]:
    starts = list(PRODUCT_CARD_START_RE.finditer(html_text))
    if not starts:
        return []
    end_limit = html_text.find('<div data-shop-api-config')
    if end_limit < 0:
        end_limit = len(html_text)

    cards: list[LeaderDriveProductCard] = []
    for index, start_match in enumerate(starts):
        block_start = start_match.start()
        block_end = starts[index + 1].start() if index + 1 < len(starts) else end_limit
        block = html_text[block_start:block_end]
        card_id = start_match.group("card_id")
        product_url = _extract_first(block, r'<a\s+href="(?P<value>https://leaderdrive\.re/[^"]+/articles/[^"]+/[^"]+)"\s+class="name d-block"')
        if not product_url:
            continue
        brand = _extract_first(block, r'<span class="brand">(?P<value>.*?)</span>')
        product_label = _extract_first(block, r'<span class="product-label">(?P<value>.*?)</span>')
        if not product_label:
            continue
        product_content = _extract_first(block, r'<span class="product-content">(?P<value>.*?)</span>')
        image_url = _extract_first(block, r'<img src="(?P<value>https://[^"]+)"[^>]*class="d-none d-lg-block')
        price_block = PRICE_BLOCK_RE.search(block)
        current_price = None
        original_price = None
        unit_price = None
        unit_price_unit = None
        promotion_badge = None
        promotion_evidence = None
        offer_mechanism = None
        discount_percent = None
        loyalty_amount = None
        loyalty_type = None
        availability_status = "available"

        price_values = []
        if price_block:
            price_values = [
                round(float(f"{match.group('int')}.{match.group('cents')}"), 2)
                for match in PRICE_VALUE_RE.finditer(price_block.group("body"))
            ]
        block_text = _strip_tags(block)
        unit_price, unit_price_unit = parse_unit_price(block_text)

        if "rupture" in block_text.lower() or "indispon" in block_text.lower():
            availability_status = "unavailable"

        if "label-promo" in block or "Prix Promo" in block_text:
            promotion_badge = "Prix Promo"
            promotion_evidence = "old_price_and_new_price"
            offer_mechanism = "direct_discount"
            if len(price_values) >= 2:
                original_price, current_price = price_values[0], price_values[1]
        elif "Prix affiché" in block_text and "Prix en caisse" in block_text:
            promotion_badge = "Remise immédiate"
            promotion_evidence = "displayed_price_cash_register_price"
            offer_mechanism = "direct_discount"
            if len(price_values) >= 2:
                original_price, current_price = price_values[0], price_values[1]
        elif "cagnotte" in block_text.lower() or "fidel" in block_text.lower() or "carte" in block_text.lower():
            promotion_badge = "Fidélité"
            promotion_evidence = "loyalty_badge"
            offer_mechanism = "loyalty_credit"
            loyalty_type = "card_credit"
            if price_values:
                current_price = price_values[0]
                loyalty_amount = price_values[1] if len(price_values) > 1 else None
        elif price_values:
            current_price = price_values[0]

        if current_price is not None and original_price and original_price > current_price:
            discount_percent = round(((original_price - current_price) / original_price) * 100, 2)

        cards.append(
            LeaderDriveProductCard(
                card_id=card_id,
                page_url=page_url,
                product_url=clean_text(product_url),
                brand=_strip_tags(brand) if brand else None,
                product_label=_strip_tags(product_label),
                product_content=_strip_tags(product_content) if product_content else None,
                image_url=clean_text(image_url) or None,
                current_price=current_price,
                original_price=original_price,
                unit_price=unit_price,
                unit_price_unit=unit_price_unit,
                promotion_badge=promotion_badge,
                promotion_evidence=promotion_evidence,
                offer_mechanism=offer_mechanism,
                discount_percent=discount_percent,
                loyalty_amount=loyalty_amount,
                loyalty_type=loyalty_type,
                availability_status=availability_status,
                raw_block=_compact_html(block),
            )
        )
    return cards


def parse_product_detail_page(html_text: str, *, product_url: str) -> LeaderDriveDetail:
    title = _extract_first(html_text, r"<h1[^>]*>\s*(?P<value>.*?)\s*</h1>")
    package_format = _extract_first(html_text, r"Contenu\s*:\s*(?P<value>[^<]+)")
    brand = None
    normalized_title = clean_text(_strip_tags(title))
    title_index = html_text.find(title) if title else -1
    if title_index > 0:
        window = html_text[max(0, title_index - 600):title_index]
        candidate = re.findall(r">([A-Z0-9 '\-]+)<", window)
        if candidate:
            brand = clean_text(candidate[-1])

    price_block = PRICE_BLOCK_RE.search(html_text)
    price_values = []
    if price_block:
        price_values = [
            round(float(f"{match.group('int')}.{match.group('cents')}"), 2)
            for match in PRICE_VALUE_RE.finditer(price_block.group("body"))
        ]
    current_price = price_values[-1] if price_values else None
    unit_price, unit_price_unit = parse_unit_price(_strip_tags(html_text))
    image_url = _extract_first(html_text, r'<img[^>]+class="product-image-main img-fluid"[^>]+src="(?P<value>https://[^"]+)"')
    return LeaderDriveDetail(
        product_url=product_url,
        brand=_strip_tags(brand) if brand else None,
        title=normalized_title or None,
        package_format=_strip_tags(package_format) if package_format else None,
        unit_price=unit_price,
        unit_price_unit=unit_price_unit,
        current_price=current_price,
        image_url=clean_text(image_url) or None,
    )


def _store_slug_from_name(name: str) -> str:
    slug = clean_text(name).lower()
    slug = slug.replace("&", " ")
    replacements = {
        "à": "a",
        "â": "a",
        "ç": "c",
        "é": "e",
        "è": "e",
        "ê": "e",
        "ë": "e",
        "î": "i",
        "ï": "i",
        "ô": "o",
        "ù": "u",
        "û": "u",
        "ü": "u",
    }
    for source, target in replacements.items():
        slug = slug.replace(source, target)
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return f"leaderprice-{slug}"


def _extract_first(block: str, pattern: str) -> str | None:
    match = re.search(pattern, block, re.S | re.I)
    if not match:
        return None
    return unescape(clean_text(match.group("value")))


def _strip_tags(value: str | None) -> str:
    return clean_text(re.sub(r"<[^>]+>", " ", unescape(value or "")))


def _compact_html(value: str) -> str:
    return clean_text(value).replace(" >", ">")
