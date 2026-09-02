from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol

from app.extractors.carrefour_reunion_products import (
    CarrefourIdentityAudit,
    CarrefourPageAudit,
    CarrefourProductCard,
    parse_carrefour_page,
)
from app.models.retail_price_observation import RetailPriceObservation
from app.services.retail_price_deduplication import (
    RetailDeduplicationSummary,
    deduplicate_observations,
)
from app.services.retail_product_normalization import (
    build_duplicate_key,
    normalize_lookup_key,
    normalize_product_name,
    parse_package_format,
)
from app.settings import Settings


CARREFOUR_ALLOWED_HOSTS = {"carrefour-reunion.com", "www.carrefour-reunion.com"}
SOURCE_TYPE = "carrefour_reunion_ssr_html"
REUNION_TIMEZONE = timezone(timedelta(hours=4), name="Indian/Reunion")
REPORT_NAME = "carrefour-reunion-readonly.json"
SOURCE_SCOPES = (
    (
        "https://www.carrefour-reunion.com/catalogues/carrefour",
        "carrefour-reunion",
        "Carrefour Réunion",
    ),
    (
        "https://www.carrefour-reunion.com/catalogues/carrefour-market",
        "carrefour-market-reunion",
        "Carrefour Market Réunion",
    ),
    (
        "https://www.carrefour-reunion.com/catalogues/carrefour-city",
        "carrefour-city-reunion",
        "Carrefour City Réunion",
    ),
)


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings): ...


@dataclass(frozen=True)
class CarrefourReadonlyMetrics:
    cards_detected: int
    unique_products: int
    carousel_duplicates_removed: int
    exploitable_prices: int
    brands_found: int
    formats_found: int
    promotions_proven: int
    promotions_with_reliable_catalog_period: int
    promotions_without_reliable_catalog_period: int
    observed_prices: int
    ambiguous_products: int
    errors: int

    def to_dict(self) -> dict[str, int]:
        return {
            "cards_detected": self.cards_detected,
            "unique_products": self.unique_products,
            "carousel_duplicates_removed": self.carousel_duplicates_removed,
            "exploitable_prices": self.exploitable_prices,
            "brands_found": self.brands_found,
            "formats_found": self.formats_found,
            "promotions_proven": self.promotions_proven,
            "promotions_with_reliable_catalog_period": self.promotions_with_reliable_catalog_period,
            "promotions_without_reliable_catalog_period": self.promotions_without_reliable_catalog_period,
            "observed_prices": self.observed_prices,
            "ambiguous_products": self.ambiguous_products,
            "errors": self.errors,
        }


@dataclass(frozen=True)
class CarrefourNativeIdentityAudit:
    native_identity_found: bool
    native_identity_kinds: tuple[str, ...]
    cards_with_dom_id: int
    cards_with_data_attributes: int
    cards_with_hidden_values: int
    cards_with_product_links: int
    cards_with_hidden_json: int
    cards_with_aria_or_title: int
    cards_with_canonical_image_path: int
    conclusion: str

    def to_dict(self) -> dict[str, object]:
        return {
            "native_identity_found": self.native_identity_found,
            "native_identity_kinds": list(self.native_identity_kinds),
            "cards_with_dom_id": self.cards_with_dom_id,
            "cards_with_data_attributes": self.cards_with_data_attributes,
            "cards_with_hidden_values": self.cards_with_hidden_values,
            "cards_with_product_links": self.cards_with_product_links,
            "cards_with_hidden_json": self.cards_with_hidden_json,
            "cards_with_aria_or_title": self.cards_with_aria_or_title,
            "cards_with_canonical_image_path": self.cards_with_canonical_image_path,
            "conclusion": self.conclusion,
        }


@dataclass(frozen=True)
class CarrefourReadonlyRunReport:
    source_urls: tuple[str, ...]
    page_audits: list[CarrefourPageAudit]
    native_identity_audit: CarrefourNativeIdentityAudit
    observations: list[RetailPriceObservation]
    deduplication: RetailDeduplicationSummary
    metrics: CarrefourReadonlyMetrics
    request_count: int
    duration_seconds: float
    classification: str
    external_cost_eur: float
    report_path: str
    errors: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "source_urls": list(self.source_urls),
            "source_type": SOURCE_TYPE,
            "scope": "retailer_reunion",
            "store_city": None,
            "page_audits": [item.to_dict() for item in self.page_audits],
            "native_identity_audit": self.native_identity_audit.to_dict(),
            "synthetic_identity": {
                "algorithm": "sha256",
                "base_components": [
                    "retailer_slug",
                    "normalized_product_name",
                    "normalized_brand",
                    "normalized_package_format",
                ],
                "weak_identity_discriminator": "price-free normalized text hash",
                "image_path_in_identity": False,
                "price_in_identity": False,
            },
            "metrics": self.metrics.to_dict(),
            "request_count": self.request_count,
            "duration_seconds": self.duration_seconds,
            "classification": self.classification,
            "external_cost_eur": self.external_cost_eur,
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


def run_carrefour_reunion_readonly(
    settings: Settings,
    *,
    fetcher: Fetcher,
    report_path: Path | None = None,
    source_scopes: tuple[tuple[str, str, str], ...] = SOURCE_SCOPES,
) -> CarrefourReadonlyRunReport:
    started = time.perf_counter()
    observed_at_datetime = datetime.now(timezone.utc)
    observed_at = observed_at_datetime.isoformat().replace("+00:00", "Z")
    reunion_reference_date = observed_at_datetime.astimezone(REUNION_TIMEZONE).date()
    request_count = 0
    errors: list[str] = []
    page_audits: list[CarrefourPageAudit] = []
    observations: list[RetailPriceObservation] = []

    for source_url, retailer_slug, _retailer_name in source_scopes:
        try:
            document = fetcher.fetch_text(
                source_url,
                allowed_hosts=CARREFOUR_ALLOWED_HOSTS,
                settings=settings,
            )
            request_count += 1
            audit = parse_carrefour_page(
                document.text,
                source_url=source_url,
                expected_retailer_slug=retailer_slug,
                reference_date=reunion_reference_date,
            )
            page_audits.append(audit)
            errors.extend(audit.errors)
            observations.extend(
                build_carrefour_observation(card, observed_at=observed_at)
                for card in audit.cards
            )
        except Exception as exc:
            errors.append(f"source_fetch_or_parse_error:{source_url}:{exc}")

    unique_observations, deduplication = deduplicate_observations(observations)
    native_audit = summarize_native_identity_audit(
        [card.identity_audit for page in page_audits for card in page.cards]
    )
    ambiguous = [item for item in unique_observations if _is_ambiguous(item)]
    metrics = CarrefourReadonlyMetrics(
        cards_detected=deduplication.total_input,
        unique_products=deduplication.unique_observations,
        carousel_duplicates_removed=deduplication.duplicates,
        exploitable_prices=len([item for item in unique_observations if item.current_price is not None]),
        brands_found=len([item for item in unique_observations if item.brand]),
        formats_found=len([item for item in unique_observations if item.package_format]),
        promotions_proven=len([item for item in unique_observations if item.promotion_proven]),
        promotions_with_reliable_catalog_period=len(
            [
                item
                for item in unique_observations
                if item.promotion_proven and item.starts_at and item.ends_at
            ]
        ),
        promotions_without_reliable_catalog_period=len(
            [
                item
                for item in unique_observations
                if item.promotion_proven and (not item.starts_at or not item.ends_at)
            ]
        ),
        observed_prices=len([item for item in unique_observations if not item.promotion_proven]),
        ambiguous_products=len(ambiguous),
        errors=len(errors),
    )
    destination = report_path or settings.report_path.parent / REPORT_NAME
    report = CarrefourReadonlyRunReport(
        source_urls=tuple(item[0] for item in source_scopes),
        page_audits=page_audits,
        native_identity_audit=native_audit,
        observations=observations,
        deduplication=deduplication,
        metrics=metrics,
        request_count=request_count,
        duration_seconds=round(time.perf_counter() - started, 3),
        classification="B",
        external_cost_eur=0.0,
        report_path=str(destination),
        errors=errors,
    )
    _write_report(destination, report)
    return report


def build_carrefour_observation(
    card: CarrefourProductCard,
    *,
    observed_at: str,
) -> RetailPriceObservation:
    normalized_name = normalize_product_name(card.raw_product_name)
    source_product_id, identity_components, identity_kind = build_carrefour_source_product_id(card)
    package = parse_package_format(card.package_format)
    pack_count = package.pack_count or _package_count(card.package_format)
    validation_errors: list[str] = []
    if not normalized_name:
        validation_errors.append("missing_product_name")
    if card.current_price is None:
        validation_errors.append("missing_current_price")
    review_reasons = [
        reason
        for reason in card.ambiguity_reasons
        if reason != "synthetic_identity_required"
    ]
    extraction_confidence = 98
    extraction_confidence -= 8 * len(review_reasons)
    extraction_confidence -= 30 * len(validation_errors)
    duplicate_key = build_duplicate_key(
        store_slug=card.retailer_slug,
        source_product_id=source_product_id,
        product_url=None,
        normalized_product_name=normalized_name,
        brand=card.brand,
        package_format=card.package_format,
    )
    return RetailPriceObservation(
        source_type=SOURCE_TYPE,
        source_url=card.source_url,
        source_product_id=source_product_id,
        source_category_id=card.retailer_slug,
        source_observed_at=observed_at,
        retailer_slug=card.retailer_slug,
        retailer_name=card.retailer_name,
        store_slug=card.retailer_slug,
        store_name=card.retailer_name,
        channel="website",
        raw_product_name=card.raw_product_name,
        product_name=card.raw_product_name,
        normalized_product_name=normalized_name,
        brand=card.brand,
        package_format=card.package_format,
        quantity_value=package.quantity_value,
        quantity_unit=package.quantity_unit,
        pack_count=pack_count,
        total_quantity_value=package.total_quantity_value,
        total_quantity_unit=package.total_quantity_unit,
        barcode=None,
        category="PROMOTIONS" if card.promotion_proven else "PRIX OBSERVÉ",
        subcategory=None,
        image_url=card.identity_audit.canonical_image_url,
        product_url=None,
        current_price=card.current_price,
        original_price=card.original_price,
        unit_price=card.unit_price,
        unit_price_unit=card.unit_price_unit,
        currency="EUR",
        price_type="promotion" if card.promotion_proven else "observed_price",
        promotion_proven=card.promotion_proven,
        promotion_evidence=card.promotion_evidence,
        promo_badge=None,
        discount_percent=card.discount_percent,
        loyalty_amount=None,
        loyalty_type=None,
        offer_mechanism=card.offer_mechanism,
        conditions=card.conditions,
        starts_at=(
            card.catalog.catalog_start_date
            if card.promotion_proven and card.catalog is not None
            else None
        ),
        ends_at=(
            card.catalog.catalog_end_date
            if card.promotion_proven and card.catalog is not None
            else None
        ),
        match_warnings=review_reasons,
        extraction_confidence=max(0, extraction_confidence),
        validation_errors=validation_errors,
        availability_status="available",
        raw_evidence={
            "scope": "retailer_reunion",
            "store_city": None,
            "description": card.description,
            "candidate_status": "needs_review",
            "identity_kind": identity_kind,
            "identity_components": identity_components,
            "identity_audit": card.identity_audit.to_dict(),
            "ambiguity_reasons": review_reasons,
            "catalog": card.catalog.to_dict() if card.catalog is not None else None,
            "catalog_membership_basis": card.catalog_membership_basis,
            "provenance": {
                "source_url": card.source_url,
                "source_type": SOURCE_TYPE,
                "retailer_scope": card.retailer_name,
                "individual_store_claimed": False,
                "catalog_source_url": (
                    card.catalog.catalog_source_url if card.catalog is not None else None
                ),
            },
        },
        duplicate_key=duplicate_key,
    )


def build_carrefour_source_product_id(
    card: CarrefourProductCard,
) -> tuple[str, dict[str, str], str]:
    if card.identity_audit.native_source_id:
        return (
            card.identity_audit.native_source_id,
            {
                "retailer_slug": card.retailer_slug,
                "native_source_id": card.identity_audit.native_source_id,
            },
            f"native:{card.identity_audit.native_source_kind or 'unknown'}",
        )

    components = {
        "retailer_slug": card.retailer_slug,
        "normalized_product_name": normalize_lookup_key(card.raw_product_name),
        "normalized_brand": normalize_lookup_key(card.brand),
        "normalized_package_format": normalize_lookup_key(card.package_format),
    }
    weak_identity = any(
        reason in {"missing_brand", "missing_package_format", "truncated_description"}
        for reason in card.ambiguity_reasons
    )
    if weak_identity:
        stable_text = "|".join(
            [
                normalize_lookup_key(card.raw_product_name),
                normalize_lookup_key(card.brand),
                normalize_lookup_key(card.package_format),
                normalize_lookup_key(card.description),
            ]
        )
        components["weak_identity_discriminator"] = hashlib.sha256(
            stable_text.encode("utf-8")
        ).hexdigest()
    seed = "|".join(f"{key}={components[key]}" for key in sorted(components))
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return f"synthetic-sha256:{digest}", components, "synthetic_sha256"


def summarize_native_identity_audit(
    audits: list[CarrefourIdentityAudit],
) -> CarrefourNativeIdentityAudit:
    kinds = sorted(
        {
            item.native_source_kind
            for item in audits
            if item.native_source_kind is not None
        }
    )
    native_found = any(item.native_source_id for item in audits)
    return CarrefourNativeIdentityAudit(
        native_identity_found=native_found,
        native_identity_kinds=tuple(kinds),
        cards_with_dom_id=len([item for item in audits if item.dom_id_candidates]),
        cards_with_data_attributes=len(
            [item for item in audits if item.data_attribute_candidates]
        ),
        cards_with_hidden_values=len(
            [item for item in audits if item.hidden_value_candidates]
        ),
        cards_with_product_links=len([item for item in audits if item.link_candidates]),
        cards_with_hidden_json=len([item for item in audits if item.json_candidates]),
        cards_with_aria_or_title=len(
            [item for item in audits if item.aria_title_candidates]
        ),
        cards_with_canonical_image_path=len(
            [item for item in audits if item.image_asset_key]
        ),
        conclusion=(
            "native_product_identity_available"
            if native_found
            else "no_native_product_identity_use_price_free_synthetic_identity"
        ),
    )


def stable_readonly_signature(report: CarrefourReadonlyRunReport) -> dict[str, object]:
    observations = [item for item in report.observations if not item.is_duplicate]
    return {
        "source_product_ids": sorted(item.source_product_id or "" for item in observations),
        "duplicate_keys": sorted(item.duplicate_key or "" for item in observations),
        "commercial_fingerprints": sorted(
            _commercial_fingerprint(item) for item in observations
        ),
    }


def _commercial_fingerprint(observation: RetailPriceObservation) -> str:
    from app.services.leader_price_importer import build_commercial_fingerprint

    return build_commercial_fingerprint(observation.to_dict())


def _is_ambiguous(observation: RetailPriceObservation) -> bool:
    return bool(observation.match_warnings)


def _package_count(package_format: str | None) -> int | None:
    if not package_format:
        return None
    import re

    match = re.search(
        r"(?:\bx\s*(?P<xcount>\d+)\b|\b(?P<unitcount>\d+)\s*(?:doses?|pi[eè]ces?|unit[eé]s?)\b)",
        package_format,
        re.I,
    )
    if not match:
        return None
    value = int(match.group("xcount") or match.group("unitcount"))
    return value if value > 1 else None


def _write_report(path: Path, report: CarrefourReadonlyRunReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
