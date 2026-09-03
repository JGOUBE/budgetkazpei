from __future__ import annotations

import html
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Protocol
from urllib.parse import parse_qs, urljoin, urlsplit

from app.models.retail_price_observation import RetailPriceObservation
from app.services.retail_price_deduplication import (
    RetailDeduplicationSummary,
    deduplicate_observations,
)
from app.services.retail_product_normalization import (
    build_duplicate_key,
    clean_text,
    normalize_product_name,
    parse_package_format,
    select_package_format,
)
from app.settings import Settings


LECLERC_ALLOWED_HOSTS = {"drivezeclerc.re", "www.drivezeclerc.re"}
SOURCE_TYPE = "eleclerc_reunion_drive_ssr_html"
RETAILER_SLUG = "eleclerc-reunion"
RETAILER_NAME = "E.Leclerc Réunion"
REUNION_TIMEZONE = timezone(timedelta(hours=4), name="Indian/Reunion")
REPORT_NAME = "eleclerc-reunion-drive-readonly.json"


@dataclass(frozen=True)
class LeclercDriveStore:
    slug: str
    source_id: str
    name: str
    city: str
    root_url: str
    primary_category_url: str

    def to_dict(self) -> dict[str, str]:
        return {
            "slug": self.slug,
            "source_id": self.source_id,
            "name": self.name,
            "city": self.city,
            "root_url": self.root_url,
        }


PILOT_STORE = LeclercDriveStore(
    slug="portail-st-leu",
    source_id="6",
    name="E.Leclerc Le Portail",
    city="Saint-Leu",
    root_url="https://www.drivezeclerc.re/portail-st-leu/",
    primary_category_url="https://www.drivezeclerc.re/portail-st-leu/132-epicerie-salee",
)
SUPPORTED_STORES = {PILOT_STORE.slug: PILOT_STORE}


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings): ...


@dataclass(frozen=True)
class LeclercProductPage:
    source_url: str
    source_product_id: str | None
    source_reference: str | None
    raw_product_name: str | None
    brand: str | None
    image_url: str | None
    category_id: str | None
    category_name: str | None
    structured_package_format: str | None
    current_price: float | None
    original_price: float | None
    unit_price: float | None
    unit_price_unit: str | None
    availability_status: str | None
    specific_price: dict[str, object] | None
    starts_at: str | None
    ends_at: str | None
    errors: tuple[str, ...]


@dataclass(frozen=True)
class LeclercReadonlyMetrics:
    inspected: int
    unique: int
    prices: int
    unit_prices: int
    promotions: int
    promotions_with_dates: int
    brands: int
    package_formats: int
    valid_ean13: int
    invalid_ean13: int
    unavailable: int
    duplicates: int
    errors: int

    def to_dict(self) -> dict[str, int]:
        return {
            "inspected": self.inspected,
            "unique": self.unique,
            "prices": self.prices,
            "unit_prices": self.unit_prices,
            "promotions": self.promotions,
            "promotions_with_dates": self.promotions_with_dates,
            "brands": self.brands,
            "package_formats": self.package_formats,
            "valid_ean13": self.valid_ean13,
            "invalid_ean13": self.invalid_ean13,
            "unavailable": self.unavailable,
            "duplicates": self.duplicates,
            "errors": self.errors,
        }


@dataclass(frozen=True)
class LeclercReadonlyRunReport:
    store: LeclercDriveStore
    observations: list[RetailPriceObservation]
    deduplication: RetailDeduplicationSummary
    metrics: LeclercReadonlyMetrics
    category_urls: tuple[str, ...]
    product_urls: tuple[str, ...]
    request_count: int
    duration_seconds: float
    report_path: str
    errors: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "source_type": SOURCE_TYPE,
            "source_url": self.store.root_url,
            "classification": "A",
            "retailer_slug": RETAILER_SLUG,
            "retailer_name": RETAILER_NAME,
            "store": self.store.to_dict(),
            "category_urls": list(self.category_urls),
            "product_urls": list(self.product_urls),
            "metrics": self.metrics.to_dict(),
            "request_count": self.request_count,
            "duration_seconds": self.duration_seconds,
            "external_cost_eur": 0.0,
            "errors": list(self.errors),
            "writes": {
                "supabase": False,
                "retail_price_candidates": False,
                "retail_price_observations": False,
                "market_price_observations": False,
                "shopping_promotions": False,
                "good_deals": False,
            },
            "observations": [item.to_dict() for item in self.observations],
        }


def resolve_store(store_slug: str) -> LeclercDriveStore:
    store = SUPPORTED_STORES.get(store_slug.strip().lower())
    if store is None:
        raise ValueError(
            f"unsupported_leclerc_store:{store_slug}:pilot_allows_only_{PILOT_STORE.slug}"
        )
    return store


def run_eleclerc_reunion_readonly(
    settings: Settings,
    *,
    fetcher: Fetcher,
    store_slug: str = PILOT_STORE.slug,
    max_products: int = 100,
    report_path: Path | None = None,
) -> LeclercReadonlyRunReport:
    if max_products <= 0:
        raise ValueError("leclerc_max_products_must_be_positive")
    store = resolve_store(store_slug)
    started = time.perf_counter()
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    request_count = 0
    errors: list[str] = []

    root = fetcher.fetch_text(
        store.root_url,
        allowed_hosts=LECLERC_ALLOWED_HOSTS,
        settings=settings,
    )
    request_count += 1
    discovered_categories = discover_category_urls(root.text, store)
    category_queue = [
        store.primary_category_url,
        *[url for url in discovered_categories if url != store.primary_category_url],
    ]

    product_urls: list[str] = []
    seen_products: set[str] = set()
    visited_category_pages: list[str] = []
    for category_url in category_queue:
        page_url: str | None = category_url
        while page_url and len(product_urls) < max_products:
            if page_url in visited_category_pages:
                break
            try:
                document = fetcher.fetch_text(
                    page_url,
                    allowed_hosts=LECLERC_ALLOWED_HOSTS,
                    settings=settings,
                )
                request_count += 1
                visited_category_pages.append(page_url)
                page_products, next_url = parse_category_page(
                    document.text,
                    page_url,
                    store,
                )
                for product_url in page_products:
                    if product_url in seen_products:
                        continue
                    seen_products.add(product_url)
                    product_urls.append(product_url)
                    if len(product_urls) >= max_products:
                        break
                page_url = next_url
            except Exception as exc:
                errors.append(f"category_fetch_or_parse_error:{page_url}:{exc}")
                break
        if len(product_urls) >= max_products:
            break

    observations: list[RetailPriceObservation] = []
    for product_url in product_urls[:max_products]:
        try:
            document = fetcher.fetch_text(
                product_url,
                allowed_hosts=LECLERC_ALLOWED_HOSTS,
                settings=settings,
            )
            request_count += 1
            page = parse_product_page(document.text, product_url, store)
            errors.extend(f"product_parse_error:{product_url}:{item}" for item in page.errors)
            observations.append(build_eleclerc_observation(page, store=store, observed_at=observed_at))
        except Exception as exc:
            errors.append(f"product_fetch_or_parse_error:{product_url}:{exc}")

    unique_observations, deduplication = deduplicate_observations(observations)
    metrics = LeclercReadonlyMetrics(
        inspected=len(product_urls[:max_products]),
        unique=deduplication.unique_observations,
        prices=len([item for item in unique_observations if item.current_price is not None]),
        unit_prices=len([item for item in unique_observations if item.unit_price is not None]),
        promotions=len([item for item in unique_observations if item.promotion_proven]),
        promotions_with_dates=len(
            [item for item in unique_observations if item.promotion_proven and item.starts_at and item.ends_at]
        ),
        brands=len([item for item in unique_observations if item.brand]),
        package_formats=len([item for item in unique_observations if item.package_format]),
        valid_ean13=len([item for item in unique_observations if item.barcode]),
        invalid_ean13=len(
            [
                item
                for item in unique_observations
                if item.raw_evidence.get("source_reference") and not item.barcode
            ]
        ),
        unavailable=len(
            [item for item in unique_observations if item.availability_status == "unavailable"]
        ),
        duplicates=deduplication.duplicates,
        errors=len(errors),
    )
    destination = report_path or settings.report_path.parent / REPORT_NAME
    report = LeclercReadonlyRunReport(
        store=store,
        observations=observations,
        deduplication=deduplication,
        metrics=metrics,
        category_urls=tuple(visited_category_pages),
        product_urls=tuple(product_urls[:max_products]),
        request_count=request_count,
        duration_seconds=round(time.perf_counter() - started, 3),
        report_path=str(destination),
        errors=errors,
    )
    _write_report(destination, report)
    return report


def discover_category_urls(source: str, store: LeclercDriveStore) -> list[str]:
    parser = _LinkParser()
    parser.feed(source)
    prefix = f"/{store.slug}/"
    categories: dict[int, str] = {}
    for href, _rel in parser.links:
        absolute = _canonical_url(urljoin(store.root_url, href))
        parsed = urlsplit(absolute)
        if (parsed.hostname or "").lower() not in LECLERC_ALLOWED_HOSTS:
            continue
        if not parsed.path.startswith(prefix) or parsed.path.endswith(".html"):
            continue
        match = re.fullmatch(rf"/{re.escape(store.slug)}/(?P<id>\d+)-[^/]+/?", parsed.path)
        if match:
            categories.setdefault(int(match.group("id")), absolute)
    return [categories[key] for key in sorted(categories)]


def parse_category_page(
    source: str,
    source_url: str,
    store: LeclercDriveStore,
) -> tuple[list[str], str | None]:
    parser = _LinkParser()
    parser.feed(source)
    products: dict[int, str] = {}
    next_url: str | None = None
    product_pattern = re.compile(
        rf"/{re.escape(store.slug)}/[^/]+/(?P<id>\d+)-[^/]+\.html$"
    )
    current_page = _page_number(source_url)
    for href, rel in parser.links:
        absolute = _canonical_url(urljoin(source_url, href))
        parsed = urlsplit(absolute)
        if (parsed.hostname or "").lower() not in LECLERC_ALLOWED_HOSTS:
            continue
        product_match = product_pattern.fullmatch(parsed.path)
        if product_match:
            products.setdefault(int(product_match.group("id")), absolute)
        if "next" in rel.lower().split() and _page_number(absolute) > current_page:
            next_url = absolute
    return [products[key] for key in sorted(products)], next_url


def parse_product_page(
    source: str,
    source_url: str,
    store: LeclercDriveStore,
) -> LeclercProductPage:
    parser = _ProductParser()
    parser.feed(source)
    scripts = "\n".join(parser.scripts)
    errors: list[str] = []

    source_product_id = _script_value(scripts, "id_product", r"\d+") or parser.hidden_product_id
    reference = _script_value(scripts, "productReference", r"[^']*")
    current_price = parser.current_price or _script_float(scripts, "productPrice")
    specific_price = _specific_price(scripts)
    specific_shop_id = _text((specific_price or {}).get("id_shop"))
    if specific_price and specific_shop_id != store.source_id:
        errors.append(f"specific_price_wrong_shop:{specific_shop_id or 'missing'}")
        specific_price = None
    promotion_proven = bool(specific_price)
    original_price = parser.original_price
    if promotion_proven and original_price is None:
        without_reduction = _script_float(scripts, "productPriceWithoutReduction")
        if without_reduction is not None and current_price is not None and without_reduction > current_price:
            original_price = without_reduction
        else:
            original_price = _positive_float((specific_price or {}).get("price"))
    starts_at = _reunion_datetime((specific_price or {}).get("from")) if promotion_proven else None
    ends_at = _reunion_datetime((specific_price or {}).get("to")) if promotion_proven else None
    unit_price, unit_price_unit = _parse_unit_price(parser.unit_price_text)

    structured_format = _structured_package_format(parser.detail_fields)
    category_id = None
    category_name = None
    if parser.category_url:
        match = re.search(rf"/{re.escape(store.slug)}/(?P<id>\d+)-", urlsplit(parser.category_url).path)
        category_id = match.group("id") if match else None
        category_name = parser.category_name
    if not source_product_id:
        errors.append("missing_id_product")
    if current_price is None:
        errors.append("missing_current_price")
    if not parser.product_name:
        errors.append("missing_product_name")

    return LeclercProductPage(
        source_url=_canonical_url(source_url),
        source_product_id=source_product_id,
        source_reference=reference,
        raw_product_name=parser.product_name,
        brand=parser.brand,
        image_url=parser.image_url,
        category_id=category_id,
        category_name=category_name,
        structured_package_format=structured_format,
        current_price=current_price,
        original_price=original_price,
        unit_price=unit_price,
        unit_price_unit=unit_price_unit,
        availability_status=parser.availability,
        specific_price=specific_price,
        starts_at=starts_at,
        ends_at=ends_at,
        errors=tuple(errors),
    )


def build_eleclerc_observation(
    page: LeclercProductPage,
    *,
    store: LeclercDriveStore = PILOT_STORE,
    observed_at: str,
) -> RetailPriceObservation:
    normalized_name = normalize_product_name(page.raw_product_name)
    chosen_format, format_source = select_package_format(
        card_product_content=page.structured_package_format,
        detail_package_format=None,
        product_label=page.raw_product_name,
    )
    if chosen_format is None:
        chosen_format = _explicit_name_package_format(page.raw_product_name)
        format_source = "product_name_explicit_quantity" if chosen_format else None
    package = parse_package_format(chosen_format)
    reference_is_valid_ean = is_valid_ean13(page.source_reference)
    specific = page.specific_price or {}
    promotion_proven = bool(page.specific_price)
    reduction = _positive_float(specific.get("reduction"))
    reduction_type = _text(specific.get("reduction_type"))
    mechanism = None
    if promotion_proven:
        # The shared retail staging contract accepts canonical mechanisms only.
        # PrestaShop's exact reduction type remains preserved in raw_evidence.
        mechanism = "direct_discount"
    discount_percent = None
    if page.original_price and page.current_price and page.original_price > page.current_price:
        discount_percent = round((page.original_price - page.current_price) / page.original_price * 100, 2)
    validation_errors = list(page.errors)
    match_warnings = ["human_validation_required"]
    if page.source_reference and not reference_is_valid_ean:
        match_warnings.append("source_reference_not_valid_ean13")
    if not page.brand:
        match_warnings.append("missing_brand")
    duplicate_key = build_duplicate_key(
        store_slug=store.slug,
        source_product_id=page.source_product_id,
        product_url=page.source_url,
        normalized_product_name=normalized_name,
        brand=page.brand,
        package_format=chosen_format,
    )
    return RetailPriceObservation(
        source_type=SOURCE_TYPE,
        source_url=page.source_url,
        source_product_id=page.source_product_id,
        source_category_id=page.category_id,
        source_observed_at=observed_at,
        retailer_slug=RETAILER_SLUG,
        retailer_name=RETAILER_NAME,
        store_slug=store.slug,
        store_name=store.name,
        channel="public_drive",
        raw_product_name=page.raw_product_name,
        product_name=page.raw_product_name,
        normalized_product_name=normalized_name,
        brand=page.brand,
        package_format=chosen_format,
        quantity_value=package.quantity_value,
        quantity_unit=package.quantity_unit,
        pack_count=package.pack_count,
        total_quantity_value=package.total_quantity_value,
        total_quantity_unit=package.total_quantity_unit,
        barcode=page.source_reference if reference_is_valid_ean else None,
        category=page.category_name,
        subcategory=None,
        image_url=page.image_url,
        product_url=page.source_url,
        current_price=page.current_price,
        original_price=page.original_price,
        unit_price=page.unit_price,
        unit_price_unit=page.unit_price_unit,
        currency="EUR",
        price_type="promotion" if promotion_proven else "observed_price",
        promotion_proven=promotion_proven,
        promotion_evidence="product_specific_price" if promotion_proven else None,
        promo_badge=None,
        discount_percent=discount_percent,
        loyalty_amount=None,
        loyalty_type=None,
        offer_mechanism=mechanism,
        conditions=None,
        starts_at=page.starts_at,
        ends_at=page.ends_at,
        match_warnings=match_warnings,
        extraction_confidence=max(0, 100 - (20 * len(page.errors)) - (5 if not page.brand else 0)),
        validation_errors=validation_errors,
        availability_status=page.availability_status,
        raw_evidence={
            "candidate_status": "needs_review",
            "store_source_id": store.source_id,
            "store_city": store.city,
            "store_official_locality": "Piton Saint-Leu",
            "source_reference": page.source_reference,
            "source_reference_kind": (
                "valid_ean13"
                if reference_is_valid_ean
                else "commercial_reference" if page.source_reference else "missing"
            ),
            "package_format_source": format_source,
            "specific_price": dict(specific) if promotion_proven else None,
            "promotion_reduction": reduction,
            "promotion_reduction_type": reduction_type,
            "availability": page.availability_status,
            "provenance": {
                "source_url": page.source_url,
                "source_type": SOURCE_TYPE,
                "store_root_url": store.root_url,
                "structured_ssr": True,
            },
        },
        duplicate_key=duplicate_key,
    )


def is_valid_ean13(value: str | None) -> bool:
    text = clean_text(value)
    if not re.fullmatch(r"\d{13}", text):
        return False
    digits = [int(char) for char in text]
    checksum = (10 - (sum(digits[:12:2]) + 3 * sum(digits[1:12:2])) % 10) % 10
    return checksum == digits[-1]


def stable_readonly_signature(report: LeclercReadonlyRunReport) -> dict[str, object]:
    from app.services.leader_price_importer import build_commercial_fingerprint

    observations = [item for item in report.observations if not item.is_duplicate]
    return {
        "source_product_ids": sorted(item.source_product_id or "" for item in observations),
        "source_identities": sorted(
            f"{item.retailer_slug}|{item.raw_evidence.get('store_source_id')}|{item.source_product_id}"
            for item in observations
        ),
        "duplicate_keys": sorted(item.duplicate_key or "" for item in observations),
        "commercial_fingerprints": sorted(
            build_commercial_fingerprint(item.to_dict()) for item in observations
        ),
    }


class _LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        values = {key.lower(): value or "" for key, value in attrs}
        if values.get("href"):
            self.links.append((values["href"], values.get("rel", "")))


class _ProductParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.product_name: str | None = None
        self.brand: str | None = None
        self.image_url: str | None = None
        self.category_url: str | None = None
        self.category_name: str | None = None
        self.current_price: float | None = None
        self.original_price: float | None = None
        self.unit_price_text: str | None = None
        self.availability: str | None = None
        self.hidden_product_id: str | None = None
        self.detail_fields: dict[str, str] = {}
        self.scripts: list[str] = []
        self._capture: str | None = None
        self._buffer: list[str] = []
        self._in_old_price = 0
        self._in_rte = 0
        self._current_detail_label: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        classes = set(values.get("class", "").split())
        tag = tag.lower()
        if tag == "script":
            self._start_capture("script")
        elif tag == "h1" and "product-name" in classes:
            self._start_capture("product_name")
        elif tag == "p" and values.get("id") == "product_reference":
            self._start_capture("brand_block")
        elif tag == "span" and values.get("itemprop") == "price":
            self.current_price = _positive_float(values.get("content")) or self.current_price
        elif tag == "p" and values.get("id") == "old_price":
            self._in_old_price += 1
            self._start_capture("old_price")
        elif tag == "strong":
            self._start_capture("strong")
        elif tag == "img" and values.get("id") == "bigpic":
            self.image_url = values.get("src") or self.image_url
        elif tag == "link" and values.get("itemprop") == "availability":
            token = values.get("href", "").lower()
            self.availability = "available" if token.endswith("instock") else "unavailable"
        elif tag == "input" and values.get("name") == "id_product":
            self.hidden_product_id = values.get("value") or self.hidden_product_id
        elif (
            tag == "a"
            and values.get("itemprop") == "url"
            and re.search(r"/\d+-[^/]+$", urlsplit(values.get("href", "")).path)
        ):
            self.category_url = values.get("href")
            self._start_capture("category")
        elif tag == "div" and "rte" in classes:
            self._in_rte += 1
        elif self._in_rte and tag == "h4":
            self._flush_detail_value()
            self._start_capture("detail_label")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "script" and self._capture == "script":
            self.scripts.append("".join(self._buffer))
            self._stop_capture()
        elif tag == "h1" and self._capture == "product_name":
            self.product_name = clean_text("".join(self._buffer)) or None
            self._stop_capture()
        elif tag == "p" and self._capture == "brand_block":
            value = clean_text("".join(self._buffer))
            self.brand = clean_text(re.sub(r"^Marque\s*:\s*", "", value, flags=re.I)) or None
            self._stop_capture()
        elif tag == "p" and self._capture == "old_price":
            self.original_price = _parse_price("".join(self._buffer))
            self._in_old_price = max(0, self._in_old_price - 1)
            self._stop_capture()
        elif tag == "strong" and self._capture == "strong":
            value = clean_text("".join(self._buffer))
            if re.search(r"€\s*/", value):
                self.unit_price_text = value
            self._stop_capture()
        elif tag == "a" and self._capture == "category":
            self.category_name = clean_text("".join(self._buffer)) or None
            self._stop_capture()
        elif tag == "h4" and self._capture == "detail_label":
            self._current_detail_label = clean_text("".join(self._buffer)).rstrip(" :")
            self._stop_capture()
        elif tag == "div" and self._in_rte:
            self._flush_detail_value()
            self._in_rte = max(0, self._in_rte - 1)

    def handle_data(self, data: str) -> None:
        if self._capture is not None:
            self._buffer.append(data)
        elif self._in_rte and self._current_detail_label:
            self._buffer.append(data)

    def _start_capture(self, name: str) -> None:
        self._capture = name
        self._buffer = []

    def _stop_capture(self) -> None:
        self._capture = None
        self._buffer = []

    def _flush_detail_value(self) -> None:
        if self._current_detail_label:
            value = clean_text("".join(self._buffer))
            if value:
                self.detail_fields[self._current_detail_label] = value
        self._current_detail_label = None
        self._buffer = []


def _script_value(source: str, name: str, value_pattern: str) -> str | None:
    match = re.search(rf"\bvar\s+{re.escape(name)}\s*=\s*'(?P<value>{value_pattern})'\s*;", source)
    if not match:
        match = re.search(rf"\bvar\s+{re.escape(name)}\s*=\s*(?P<value>{value_pattern})\s*;", source)
    return html.unescape(match.group("value")) if match else None


def _script_float(source: str, name: str) -> float | None:
    value = _script_value(source, name, r"\d+(?:\.\d+)?")
    return _positive_float(value)


def _specific_price(source: str) -> dict[str, object] | None:
    match = re.search(r"\bvar\s+product_specific_price\s*=\s*(\{.*?\}|null)\s*;", source)
    if not match or match.group(1) == "null":
        return None
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _structured_package_format(fields: dict[str, str]) -> str | None:
    normalized = {clean_text(key).lower(): value for key, value in fields.items()}
    for key in ("contenu net", "poids net"):
        value = clean_text(normalized.get(key))
        if value and re.search(r"\d\s*(?:kg|g|l|cl|ml)\b", value, flags=re.I):
            return value
    return None


def _explicit_name_package_format(value: str | None) -> str | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None
    matches = list(
        re.finditer(
            r"(?:\b\d+\s*[xX]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|grs?|g|l|cl|ml)\b",
            cleaned,
            flags=re.I,
        )
    )
    if not matches:
        return None
    candidate = clean_text(matches[-1].group(0))
    return re.sub(r"grs?\b", "g", candidate, flags=re.I) or None


def _parse_unit_price(value: str | None) -> tuple[float | None, str | None]:
    match = re.search(
        r"(?P<value>\d+(?:[.,]\d+)?)\s*€\s*/\s*(?P<unit>kg|g|l|cl|ml|unité|unit[eé])\b",
        clean_text(value),
        flags=re.I,
    )
    if not match:
        return None, None
    unit = match.group("unit").lower().replace("é", "e")
    return round(float(match.group("value").replace(",", ".")), 3), "unite" if unit.startswith("unit") else unit


def _reunion_datetime(value: object) -> str | None:
    text = _text(value)
    if not text or text.startswith("0000-00-00"):
        return None
    try:
        parsed = datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return parsed.replace(tzinfo=REUNION_TIMEZONE).isoformat()


def _page_number(url: str) -> int:
    values = parse_qs(urlsplit(url).query).get("p", ["1"])
    try:
        return int(values[0])
    except (TypeError, ValueError):
        return 1


def _canonical_url(url: str) -> str:
    parsed = urlsplit(html.unescape(url.strip()))
    scheme = parsed.scheme.lower() or "https"
    host = (parsed.hostname or "").lower()
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{scheme}://{host}{parsed.path.rstrip('/')}{query}"


def _parse_price(value: str | None) -> float | None:
    match = re.search(r"\d+(?:[.,]\d+)?", clean_text(value).replace(" ", ""))
    return _positive_float(match.group(0).replace(",", ".")) if match else None


def _positive_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return round(parsed, 3) if parsed > 0 else None


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _write_report(path: Path, report: LeclercReadonlyRunReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
