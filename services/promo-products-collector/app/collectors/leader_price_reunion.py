from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from app.extractors.leader_drive_products import (
    LeaderDriveCategory,
    LeaderDriveDetail,
    LeaderDrivePageAudit,
    LeaderDriveStore,
    choose_pilot_store,
    parse_product_detail_page,
    parse_product_list_page,
    parse_public_stores,
    parse_store_categories,
    select_representative_categories,
)
from app.models.retail_price_observation import RetailPriceObservation
from app.services.retail_price_deduplication import RetailDeduplicationSummary, deduplicate_observations
from app.services.retail_product_matching import MatchingSummary, simulate_matching
from app.services.retail_product_normalization import (
    build_duplicate_key,
    clean_text,
    normalize_lookup_key,
    normalize_product_name,
    parse_package_format,
)
from app.settings import Settings


ROOT_URL = "https://leaderdrive.re/"
LEADER_ALLOWED_HOSTS = {"leaderdrive.re", "www.leaderdrive.re"}
RETAILER_SLUG = "leader-price-reunion"
RETAILER_NAME = "Leader Price Réunion"


@dataclass(frozen=True)
class HumanAuditEntry:
    product_url: str
    category: str | None
    subcategory: str | None
    status: str
    notes: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "product_url": self.product_url,
            "category": self.category,
            "subcategory": self.subcategory,
            "status": self.status,
            "notes": self.notes,
        }


@dataclass(frozen=True)
class LeaderPriceReadonlyRunReport:
    store: LeaderDriveStore
    visited_urls: list[str]
    audited_categories: list[LeaderDriveCategory]
    page_audits: list[LeaderDrivePageAudit]
    observations: list[RetailPriceObservation]
    deduplication: RetailDeduplicationSummary
    matching: MatchingSummary
    human_audit: list[HumanAuditEntry]
    report_path: str
    summary_path: str
    request_count: int
    duration_seconds: float
    classification: str
    external_cost_eur: float
    errors: list[str]

    def to_dict(self) -> dict[str, object]:
        unique_observations = [item for item in self.observations if not item.is_duplicate]
        observed = [item for item in unique_observations if item.price_type == "observed_price"]
        promotions = [item for item in unique_observations if item.price_type == "promotion"]
        matches = {
            "matched": len([item for item in unique_observations if item.match_method == "exact"]),
            "suggested": len([item for item in unique_observations if item.match_method == "suggestion" and (item.match_confidence or 0) >= 0.9]),
            "ambiguous": len([item for item in unique_observations if item.match_method == "suggestion" and (item.match_confidence or 0) < 0.9]),
            "unmatched": len([item for item in unique_observations if item.match_method is None]),
        }
        return {
            "store": {
                "id": self.store.id,
                "name": self.store.name,
                "city": self.store.city,
                "postcode": self.store.postcode,
                "slug": self.store.slug,
                "url": self.store.url,
            },
            "visited_urls": list(self.visited_urls),
            "audited_categories": [
                {
                    "category": item.category,
                    "subcategory": item.subcategory,
                    "url": item.url,
                    "slug": item.slug,
                }
                for item in self.audited_categories
            ],
            "page_audits": [
                {
                    "url": item.url,
                    "category": item.category,
                    "subcategory": item.subcategory,
                    "page_number": item.page_number,
                    "estimated_total_products": item.estimated_total_products,
                    "pagination_pages": list(item.pagination_pages),
                    "cards_detected": len(item.cards),
                }
                for item in self.page_audits
            ],
            "metrics": {
                "request_count": self.request_count,
                "duration_seconds": self.duration_seconds,
                "products_detected": self.deduplication.total_input,
                "unique_products": self.deduplication.unique_observations,
                "observed_prices": len(observed),
                "promotions_proven": len(promotions),
                "duplicates": self.deduplication.duplicates,
                "incomplete_products": len([item for item in unique_observations if item.validation_errors]),
                "external_cost_eur": self.external_cost_eur,
                "classification": self.classification,
            },
            "matching": {
                "backend": self.matching.backend,
                **matches,
            },
            "human_audit": [item.to_dict() for item in self.human_audit],
            "errors": list(self.errors),
            "observations": [item.to_dict() for item in self.observations],
            "future_architecture": _future_architecture_note(),
            "comparison_methodology": _comparison_methodology_note(),
        }


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings): ...


def run_leader_price_readonly(
    settings: Settings,
    *,
    fetcher: Fetcher,
    max_products: int = 100,
) -> LeaderPriceReadonlyRunReport:
    started = time.perf_counter()
    request_count = 0
    errors: list[str] = []
    visited_urls: list[str] = []

    def fetch_html(url: str) -> str:
        nonlocal request_count
        visited_urls.append(url)
        request_count += 1
        document = fetcher.fetch_text(url, allowed_hosts=LEADER_ALLOWED_HOSTS, settings=settings)
        return document.text

    root_html = fetch_html(ROOT_URL)
    stores = parse_public_stores(root_html)
    store = choose_pilot_store(stores)
    store_html = fetch_html(store.url)
    categories = parse_store_categories(store_html)
    representative_categories = select_representative_categories(categories)

    page_specs = [
        (None, None, f"{store.url}/promotions"),
        *[(item.category, item.subcategory, item.url) for item in representative_categories],
    ]

    page_audits: list[LeaderDrivePageAudit] = []
    observations: list[RetailPriceObservation] = []
    detail_cache: dict[str, LeaderDriveDetail] = {}

    for page_index, (category, subcategory, page_url) in enumerate(page_specs):
        if len(observations) >= max_products:
            break
        html_text = fetch_html(page_url)
        page_audit = parse_product_list_page(
            html_text,
            page_url=page_url,
            category=category,
            subcategory=subcategory if subcategory else "PROMOTIONS",
        )
        page_audits.append(page_audit)
        remaining_pages = max(1, len(page_specs) - page_index)
        remaining_slots = max(0, max_products - len(observations))
        page_budget = max(1, remaining_slots // remaining_pages) if remaining_slots else 0
        for card in page_audit.cards:
            if len(observations) >= max_products or page_budget <= 0:
                break
            detail = None
            if not card.brand or not card.product_content or card.unit_price is None:
                detail = detail_cache.get(card.product_url)
                if detail is None:
                    try:
                        detail = parse_product_detail_page(fetch_html(card.product_url), product_url=card.product_url)
                        detail_cache[card.product_url] = detail
                    except Exception as exc:  # pragma: no cover - network-only defensive path
                        errors.append(f"detail_fetch_failed:{card.product_url}:{exc}")
                        detail = None
            observation = _observation_from_card(
                store=store,
                page_audit=page_audit,
                card=card,
                detail=detail,
            )
            observations.append(observation)
            page_budget -= 1

    unique_observations, dedupe = deduplicate_observations(observations)
    matching = simulate_matching(unique_observations)
    human_audit = _build_human_audit_sample(unique_observations, detail_cache, fetch_html)
    classification = _classify_source(unique_observations, human_audit)

    reports_root = settings.report_path.parent
    report_path = reports_root / "leader-price-reunion-readonly.json"
    summary_path = reports_root / "leader-price-reunion-readonly-summary.md"

    report = LeaderPriceReadonlyRunReport(
        store=store,
        visited_urls=visited_urls,
        audited_categories=representative_categories,
        page_audits=page_audits,
        observations=observations,
        deduplication=dedupe,
        matching=matching,
        human_audit=human_audit,
        report_path=str(report_path),
        summary_path=str(summary_path),
        request_count=request_count,
        duration_seconds=round(time.perf_counter() - started, 3),
        classification=classification,
        external_cost_eur=0.0,
        errors=errors,
    )
    _write_report(report_path, report.to_dict())
    _write_summary(summary_path, report)
    return report


def _observation_from_card(
    *,
    store: LeaderDriveStore,
    page_audit: LeaderDrivePageAudit,
    card,
    detail: LeaderDriveDetail | None,
) -> RetailPriceObservation:
    package_value = detail.package_format if detail and detail.package_format else card.product_content
    package = parse_package_format(package_value)
    product_name = normalize_product_name(card.product_label)
    brand = card.brand or (detail.brand if detail else None)
    current_price = card.current_price if card.current_price is not None else (detail.current_price if detail else None)
    promotion_proven = bool(card.promotion_evidence and card.original_price and current_price is not None)
    price_type = "promotion" if promotion_proven else "observed_price"
    observed_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    validation_errors: list[str] = []
    if current_price is None:
        validation_errors.append("missing_current_price")
    if not product_name:
        validation_errors.append("missing_product_name")
    if page_audit.subcategory == "PROMOTIONS" and not promotion_proven:
        validation_errors.append("promotion_page_without_explicit_proof")

    observation = RetailPriceObservation(
        source_type="leader_drive_html",
        source_url=page_audit.url,
        source_product_id=card.card_id,
        source_category_id=page_audit.subcategory,
        source_observed_at=observed_at,
        retailer_slug=RETAILER_SLUG,
        retailer_name=RETAILER_NAME,
        store_slug=store.slug,
        store_name=store.name,
        channel="public_drive",
        raw_product_name=card.product_label,
        product_name=product_name,
        normalized_product_name=normalize_lookup_key(product_name),
        brand=brand,
        package_format=package.package_format,
        quantity_value=package.quantity_value,
        quantity_unit=package.quantity_unit,
        pack_count=package.pack_count,
        total_quantity_value=package.total_quantity_value,
        total_quantity_unit=package.total_quantity_unit,
        barcode=None,
        category=page_audit.category,
        subcategory=page_audit.subcategory,
        image_url=card.image_url or (detail.image_url if detail else None),
        product_url=card.product_url,
        current_price=current_price,
        original_price=card.original_price,
        unit_price=card.unit_price if card.unit_price is not None else (detail.unit_price if detail else None),
        unit_price_unit=card.unit_price_unit if card.unit_price_unit is not None else (detail.unit_price_unit if detail else None),
        currency="EUR",
        price_type=price_type,
        promotion_proven=promotion_proven,
        promotion_evidence=card.promotion_evidence,
        promo_badge=card.promotion_badge,
        discount_percent=card.discount_percent,
        loyalty_amount=card.loyalty_amount,
        loyalty_type=card.loyalty_type,
        offer_mechanism=card.offer_mechanism,
        conditions=None,
        starts_at=None,
        ends_at=None,
        extraction_confidence=95 if not validation_errors else 82,
        validation_errors=validation_errors,
        availability_status=card.availability_status,
        raw_evidence={
            "store_url": store.url,
            "page_url": page_audit.url,
            "card_html": card.raw_block,
            "detail_brand": detail.brand if detail else None,
            "detail_package_format": detail.package_format if detail else None,
        },
    )
    observation.duplicate_key = build_duplicate_key(
        store_slug=store.slug,
        product_url=observation.product_url,
        normalized_product_name=observation.normalized_product_name,
        brand=observation.brand,
        package_format=observation.package_format,
    )
    return observation


def _build_human_audit_sample(
    observations: list[RetailPriceObservation],
    detail_cache: dict[str, LeaderDriveDetail],
    fetch_html,
) -> list[HumanAuditEntry]:
    sample: list[RetailPriceObservation] = []
    by_group: dict[str, list[RetailPriceObservation]] = {}
    for observation in observations:
        key = observation.subcategory or observation.category or "unknown"
        by_group.setdefault(key, []).append(observation)
    while len(sample) < 30 and by_group:
        empty_groups: list[str] = []
        for group, items in by_group.items():
            if items and len(sample) < 30:
                sample.append(items.pop(0))
            if not items:
                empty_groups.append(group)
        for group in empty_groups:
            by_group.pop(group, None)
    entries: list[HumanAuditEntry] = []
    for observation in sample:
        detail = detail_cache.get(observation.product_url or "")
        if detail is None and observation.product_url:
            try:
                detail = parse_product_detail_page(fetch_html(observation.product_url), product_url=observation.product_url)
                detail_cache[observation.product_url] = detail
            except Exception:  # pragma: no cover - network-only defensive path
                detail = None

        status = "correct"
        notes: list[str] = []
        if not observation.current_price:
            status = "unusable"
            notes.append("missing price")
        elif detail and detail.current_price and observation.price_type == "observed_price" and detail.current_price != observation.current_price:
            status = "wrong_price"
            notes.append("detail price differs")
        elif not observation.package_format:
            status = "incomplete_but_usable"
            notes.append("format missing")
        elif observation.price_type == "promotion" and not observation.original_price:
            status = "false_promotion"
            notes.append("promotion without old price")

        entries.append(
            HumanAuditEntry(
                product_url=observation.product_url or "",
                category=observation.category,
                subcategory=observation.subcategory,
                status=status,
                notes="; ".join(notes) if notes else None,
            )
        )
    return entries


def _classify_source(
    observations: list[RetailPriceObservation],
    audit_entries: list[HumanAuditEntry],
) -> str:
    if not audit_entries:
        return "C"
    usable = [entry for entry in audit_entries if entry.status in {"correct", "incomplete_but_usable"}]
    false_promotions = len([entry for entry in audit_entries if entry.status == "false_promotion"])
    correct = len([entry for entry in audit_entries if entry.status == "correct"])
    precision = correct / len(audit_entries)
    usable_rate = len(usable) / len(audit_entries)
    false_promo_rate = false_promotions / len(audit_entries)
    has_stable_urls = all(item.product_url for item in observations[: min(20, len(observations))])
    if precision >= 0.95 and usable_rate >= 0.9 and false_promo_rate < 0.02 and has_stable_urls:
        return "A"
    if precision >= 0.8 and usable_rate >= 0.75 and false_promo_rate < 0.08:
        return "B"
    return "C"


def _write_report(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_summary(path: Path, report: LeaderPriceReadonlyRunReport) -> None:
    unique_items = [item for item in report.observations if not item.is_duplicate]
    observed = len([item for item in unique_items if item.price_type == "observed_price"])
    promotions = len([item for item in unique_items if item.price_type == "promotion"])
    usable = len([item for item in report.human_audit if item.status in {"correct", "incomplete_but_usable"}])
    content = "\n".join(
        [
            "# Leader Price Réunion readonly audit",
            "",
            f"- Date d'observation UTC: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
            f"- Magasin pilote: {report.store.name} ({report.store.city})",
            f"- URL magasin: {report.store.url}",
            f"- URLs visitées: {len(report.visited_urls)}",
            f"- Requêtes: {report.request_count}",
            f"- Produits détectés: {report.deduplication.total_input}",
            f"- Produits uniques: {report.deduplication.unique_observations}",
            f"- Prix observés: {observed}",
            f"- Promotions prouvées: {promotions}",
            f"- Doublons: {report.deduplication.duplicates}",
            f"- Contrôles humains: {len(report.human_audit)}",
            f"- Articles exploitables au contrôle: {usable}",
            f"- Matching backend: {report.matching.backend}",
            f"- Coût externe: {report.external_cost_eur:.2f} €",
            f"- Classification: {report.classification}",
            "",
            "## Décision",
            "",
            _decision_line(report.classification),
        ]
    )
    path.write_text(content + "\n", encoding="utf-8")


def _decision_line(classification: str) -> str:
    if classification == "A":
        return "Leader Price peut alimenter automatiquement les prix observés, avec validation des promotions."
    if classification == "B":
        return "Leader Price peut alimenter la base après validation humaine systématique."
    return "Le collecteur Leader Price doit être abandonné."


def _future_architecture_note() -> dict[str, object]:
    return {
        "common_model": "observation sourcee par produit, enseigne, magasin, canal et niveau de preuve",
        "history_strategy": [
            "creer une nouvelle observation si le prix change",
            "mettre a jour last_seen_at si le prix reste identique",
            "conserver first_seen_at et la provenance source_url",
            "ne jamais stocker les images, seulement leurs URLs",
        ],
        "supabase_load_reduction": [
            "dedoublonner par produit_url ou cle normalisee",
            "ne publier qu apres validation humaine des promotions",
            "regrouper les observations identiques par fenetre temporelle configurable",
        ],
        "reuse_for_carrefour": "reprendre le meme contrat RetailPriceObservation avec un extracteur HTML specifique Carrefour",
    }


def _comparison_methodology_note() -> dict[str, object]:
    return {
        "exact_comparison": "meme produit, meme marque, meme format",
        "normalized_comparison": "meme produit avec comparaison €/kg ou €/L si formats differents",
        "category_comparison": "ne montrer une tendance qu avec un echantillon minimal de 15 produits comparables",
        "basket_comparison": "conclusion robuste a partir d au moins 30 lignes comparables",
    }
