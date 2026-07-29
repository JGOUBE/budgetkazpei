from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

from app.db.supabase_client import SupabaseAdminClient
from app.models.retail_price_observation import RetailPriceObservation
from app.settings import Settings


EXPECTED_RETAILER_SLUG = "leader-price-reunion"
EXPECTED_STORE_SLUG = "leaderprice-lp-ermitage"
EXPECTED_STORE_NAME = "LP Ermitage"
DEFAULT_REPORT_NAME = "leader-price-reunion-readonly.json"


class RetailImportClient(Protocol):
    def rpc(self, function_name: str, payload: dict[str, object] | None = None) -> object: ...


@dataclass(frozen=True)
class LeaderPriceImportSummary:
    source_run_id: str
    retailer_slug: str
    store_slug: str
    imported: int
    updated: int
    unchanged: int
    duplicate: int
    rejected: int
    needs_review: int
    imported_items: int
    report_path: str

    def to_dict(self) -> dict[str, object]:
        return {
            "source_run_id": self.source_run_id,
            "retailer_slug": self.retailer_slug,
            "store_slug": self.store_slug,
            "imported": self.imported,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "duplicate": self.duplicate,
            "rejected": self.rejected,
            "needs_review": self.needs_review,
            "imported_items": self.imported_items,
            "report_path": self.report_path,
        }


def import_leader_price_report(
    settings: Settings,
    *,
    report_path: Path | None = None,
    max_products: int = 100,
    client: RetailImportClient | None = None,
) -> LeaderPriceImportSummary:
    payload = _load_report_payload(report_path or settings.report_path.parent / DEFAULT_REPORT_NAME)
    store = payload["store"]

    retailer_slug = _expect_text(payload["observations"][0]["retailer_slug"], "retailer_slug")
    if retailer_slug != EXPECTED_RETAILER_SLUG:
        raise ValueError(f"unsupported_retailer_slug:{retailer_slug}")

    if _expect_text(store["slug"], "store.slug") != EXPECTED_STORE_SLUG:
        raise ValueError(f"unsupported_store_slug:{store['slug']}")
    if _expect_text(store["name"], "store.name") != EXPECTED_STORE_NAME:
        raise ValueError(f"unsupported_store_name:{store['name']}")

    observations = payload["observations"][:max_products]
    source_run_id = build_source_run_id(observations)
    rpc_items = [_to_rpc_item(item) for item in observations]

    supabase_client = client or _build_client(settings)
    rpc_result = supabase_client.rpc(
        "retail_import_price_candidates",
        {
            "p_source_run_id": source_run_id,
            "p_items": rpc_items,
        },
    )

    summary = _coerce_summary(
        rpc_result,
        source_run_id=source_run_id,
        retailer_slug=retailer_slug,
        store_slug=EXPECTED_STORE_SLUG,
        imported_items=len(rpc_items),
        report_path=str(report_path or settings.report_path.parent / DEFAULT_REPORT_NAME),
    )
    return summary


def build_source_run_id(observations: list[dict[str, object]]) -> str:
    if not observations:
        raise ValueError("leader_price_report_has_no_observations")

    keys = sorted(
        f"{item.get('source_product_id') or ''}|{item.get('duplicate_key') or ''}|{item.get('source_observed_at') or ''}"
        for item in observations
    )
    retailer_slug = _expect_text(observations[0].get("retailer_slug"), "retailer_slug")
    store_slug = _expect_text(observations[0].get("store_slug"), "store_slug")
    seed = f"{retailer_slug}|{store_slug}|{len(observations)}|{'::'.join(keys)}"
    return str(uuid5(NAMESPACE_URL, seed))


def _build_client(settings: Settings) -> SupabaseAdminClient:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("missing_supabase_admin_env")
    return SupabaseAdminClient(settings.supabase_url, settings.supabase_service_role_key)


def _load_report_payload(path: Path) -> dict[str, object]:
    if not path.exists():
        raise FileNotFoundError(f"leader_price_report_not_found:{path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("leader_price_report_invalid_root")
    if "store" not in data or "observations" not in data:
        raise ValueError("leader_price_report_missing_fields")
    observations = data["observations"]
    if not isinstance(observations, list) or not observations:
        raise ValueError("leader_price_report_has_no_observations")
    return data


def _to_rpc_item(raw_item: dict[str, object]) -> dict[str, object]:
    observation = RetailPriceObservation(
        source_type=str(raw_item["source_type"]),
        source_url=str(raw_item["source_url"]),
        source_product_id=_optional_text(raw_item.get("source_product_id")),
        source_category_id=_optional_text(raw_item.get("source_category_id")),
        source_observed_at=str(raw_item["source_observed_at"]),
        retailer_slug=str(raw_item["retailer_slug"]),
        retailer_name=str(raw_item["retailer_name"]),
        store_slug=str(raw_item["store_slug"]),
        store_name=str(raw_item["store_name"]),
        channel=str(raw_item["channel"]),
        raw_product_name=_optional_text(raw_item.get("raw_product_name")),
        product_name=_optional_text(raw_item.get("product_name")),
        normalized_product_name=_optional_text(raw_item.get("normalized_product_name")),
        brand=_optional_text(raw_item.get("brand")),
        package_format=_optional_text(raw_item.get("package_format")),
        quantity_value=_optional_float(raw_item.get("quantity_value")),
        quantity_unit=_optional_text(raw_item.get("quantity_unit")),
        pack_count=_optional_int(raw_item.get("pack_count")),
        total_quantity_value=_optional_float(raw_item.get("total_quantity_value")),
        total_quantity_unit=_optional_text(raw_item.get("total_quantity_unit")),
        barcode=_optional_text(raw_item.get("barcode")),
        category=_optional_text(raw_item.get("category")),
        subcategory=_optional_text(raw_item.get("subcategory")),
        image_url=_optional_text(raw_item.get("image_url")),
        product_url=_optional_text(raw_item.get("product_url")),
        current_price=_optional_float(raw_item.get("current_price")),
        original_price=_optional_float(raw_item.get("original_price")),
        unit_price=_optional_float(raw_item.get("unit_price")),
        unit_price_unit=_optional_text(raw_item.get("unit_price_unit")),
        currency=str(raw_item.get("currency") or "EUR"),
        price_type=str(raw_item["price_type"]),
        promotion_proven=bool(raw_item.get("promotion_proven")),
        promotion_evidence=_optional_text(raw_item.get("promotion_evidence")),
        promo_badge=_optional_text(raw_item.get("promo_badge")),
        discount_percent=_optional_float(raw_item.get("discount_percent")),
        loyalty_amount=_optional_float(raw_item.get("loyalty_amount")),
        loyalty_type=_optional_text(raw_item.get("loyalty_type")),
        offer_mechanism=_optional_text(raw_item.get("offer_mechanism")),
        conditions=_optional_text(raw_item.get("conditions")),
        starts_at=_optional_text(raw_item.get("starts_at")),
        ends_at=_optional_text(raw_item.get("ends_at")),
        matched_market_product_id=_optional_text(raw_item.get("matched_market_product_id")),
        matched_product_key=_optional_text(raw_item.get("matched_product_key")),
        match_method=_optional_text(raw_item.get("match_method")),
        match_confidence=_optional_float(raw_item.get("match_confidence")),
        match_warnings=_json_list(raw_item.get("match_warnings")),
        extraction_confidence=int(raw_item.get("extraction_confidence") or 0),
        validation_errors=_json_list(raw_item.get("validation_errors")),
        availability_status=_optional_text(raw_item.get("availability_status")),
        raw_evidence=dict(raw_item.get("raw_evidence") or {}),
        duplicate_key=_optional_text(raw_item.get("duplicate_key")),
        is_duplicate=bool(raw_item.get("is_duplicate")),
        duplicate_of=_optional_text(raw_item.get("duplicate_of")),
    )

    return {
        **observation.to_dict(),
        "store_city": _optional_text(raw_item.get("store_city")) or "Saint-Gilles Les Bains",
        "promotion_evidence": (
            {"kind": observation.promotion_evidence}
            if observation.promotion_evidence
            else None
        ),
    }


def _coerce_summary(
    payload: object,
    *,
    source_run_id: str,
    retailer_slug: str,
    store_slug: str,
    imported_items: int,
    report_path: str,
) -> LeaderPriceImportSummary:
    if not isinstance(payload, dict):
        raise RuntimeError("retail_import_summary_invalid")

    def _count(name: str) -> int:
        value = payload.get(name, 0)
        return int(value) if isinstance(value, (int, float, str)) and str(value).strip() else 0

    return LeaderPriceImportSummary(
        source_run_id=str(payload.get("source_run_id") or source_run_id),
        retailer_slug=retailer_slug,
        store_slug=store_slug,
        imported=_count("imported"),
        updated=_count("updated"),
        unchanged=_count("unchanged"),
        duplicate=_count("duplicate"),
        rejected=_count("rejected"),
        needs_review=_count("needs_review"),
        imported_items=imported_items,
        report_path=report_path,
    )


def _expect_text(value: object, field_name: str) -> str:
    text = _optional_text(value)
    if not text:
        raise ValueError(f"missing_required_field:{field_name}")
    return text


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def _optional_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    return int(value)


def _json_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]
