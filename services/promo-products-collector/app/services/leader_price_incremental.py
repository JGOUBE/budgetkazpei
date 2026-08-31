from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import NAMESPACE_URL, uuid5

from app.collectors.leader_price_reunion import (
    LeaderPriceReadonlyRunReport,
    run_leader_price_readonly,
)
from app.db.supabase_client import SupabaseAdminClient
from app.services.leader_price_importer import (
    EXPECTED_RETAILER_SLUG,
    EXPECTED_STORE_SLUG,
    LeaderPriceImportSummary,
    build_commercial_fingerprint,
    build_source_product_identity,
    import_leader_price_observations,
    to_rpc_item,
)
from app.settings import Settings


EXISTING_COLUMNS = (
    "id,source_run_id,source_product_id,product_url,retailer_slug,store_slug,"
    "duplicate_key,source_observed_at,created_at,updated_at,current_price,original_price,"
    "promotion_proven,offer_mechanism,package_format,price_type"
)
INCREMENTAL_REPORT_NAME = "leader-price-incremental-report.json"


class IncrementalClient(Protocol):
    def select(
        self,
        table: str,
        *,
        filters: dict[str, str] | None = None,
        columns: str = "*",
    ) -> list[dict[str, object]]: ...

    def rpc(self, function_name: str, payload: dict[str, object] | None = None) -> object: ...


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings): ...


@dataclass(frozen=True)
class IncrementalAction:
    source_identity: str
    source_product_id: str | None
    product_url: str | None
    product_name: str | None
    change_type: str
    commercial_fingerprint: str | None
    previous_commercial_fingerprint: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "source_identity": self.source_identity,
            "source_product_id": self.source_product_id,
            "product_url": self.product_url,
            "product_name": self.product_name,
            "change_type": self.change_type,
            "commercial_fingerprint": self.commercial_fingerprint,
            "previous_commercial_fingerprint": self.previous_commercial_fingerprint,
        }


@dataclass(frozen=True)
class LeaderPriceIncrementalMetrics:
    products_inspected: int
    unique_products: int
    new_products: int
    price_changes: int
    new_promotions: int
    returns_to_normal: int
    other_commercial_changes: int
    unchanged: int
    unusable_without_price: int
    candidates_to_create: int
    candidates_created: int
    candidates_refreshed: int
    errors: int

    def to_dict(self) -> dict[str, int]:
        return {
            "products_inspected": self.products_inspected,
            "unique_products": self.unique_products,
            "new_products": self.new_products,
            "price_changes": self.price_changes,
            "new_promotions": self.new_promotions,
            "returns_to_normal": self.returns_to_normal,
            "other_commercial_changes": self.other_commercial_changes,
            "unchanged": self.unchanged,
            "unusable_without_price": self.unusable_without_price,
            "candidates_to_create": self.candidates_to_create,
            "candidates_created": self.candidates_created,
            "candidates_refreshed": self.candidates_refreshed,
            "errors": self.errors,
        }


@dataclass(frozen=True)
class LeaderPriceIncrementalReport:
    dry_run: bool
    retailer_slug: str
    store_slug: str
    collection_report_path: str
    report_path: str
    metrics: LeaderPriceIncrementalMetrics
    actions: list[IncrementalAction]
    import_summary: LeaderPriceImportSummary | None
    errors: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "dry_run": self.dry_run,
            "mode": "dry-run" if self.dry_run else "real",
            "retailer_slug": self.retailer_slug,
            "store_slug": self.store_slug,
            "collection_report_path": self.collection_report_path,
            "report_path": self.report_path,
            "metrics": self.metrics.to_dict(),
            "actions": [item.to_dict() for item in self.actions],
            "import_summary": self.import_summary.to_dict() if self.import_summary else None,
            "errors": list(self.errors),
            "writes": {
                "retail_price_candidates": not self.dry_run,
                "shopping_promotions": False,
                "good_deals": False,
                "retail_price_observations": False,
                "market_price_observations": False,
            },
        }


@dataclass(frozen=True)
class _PlannedObservation:
    observation: dict[str, object]
    existing: dict[str, object] | None
    action: IncrementalAction


def run_leader_price_incremental(
    settings: Settings,
    *,
    fetcher: Fetcher,
    dry_run: bool,
    max_products: int = 100,
    client: IncrementalClient | None = None,
    report_path: Path | None = None,
) -> LeaderPriceIncrementalReport:
    collection = run_leader_price_readonly(
        settings,
        fetcher=fetcher,
        max_products=max_products,
    )
    admin_client = client or _build_client(settings)
    existing_rows = admin_client.select(
        "retail_price_candidates",
        filters={
            "retailer_slug": f"eq.{EXPECTED_RETAILER_SLUG}",
            "store_slug": f"eq.{EXPECTED_STORE_SLUG}",
            "order": "source_observed_at.desc,created_at.desc",
            "limit": "10000",
        },
        columns=EXISTING_COLUMNS,
    )
    candidates, unchanged, actions, planning_errors = plan_incremental_observations(
        collection,
        existing_rows,
    )
    errors = [*collection.errors, *planning_errors]
    import_summary: LeaderPriceImportSummary | None = None
    refreshed = 0

    if not dry_run:
        refreshed, refresh_errors = _refresh_unchanged_candidates(admin_client, unchanged)
        errors.extend(refresh_errors)
        if candidates:
            import_summary = import_leader_price_observations(
                [item.observation for item in candidates],
                client=admin_client,
                source_run_id=build_incremental_source_run_id(candidates),
                report_path=collection.report_path,
            )

    counts = _count_actions(actions)
    destination = report_path or settings.report_path.parent / INCREMENTAL_REPORT_NAME
    metrics = LeaderPriceIncrementalMetrics(
        products_inspected=collection.deduplication.total_input,
        unique_products=collection.deduplication.unique_observations,
        new_products=counts.get("new_product", 0),
        price_changes=counts.get("price_change", 0),
        new_promotions=counts.get("new_promotion", 0),
        returns_to_normal=counts.get("return_to_normal", 0),
        other_commercial_changes=counts.get("other_commercial_change", 0),
        unchanged=counts.get("unchanged", 0),
        unusable_without_price=counts.get("unusable_without_price", 0),
        candidates_to_create=len(candidates),
        candidates_created=import_summary.imported if import_summary else 0,
        candidates_refreshed=refreshed,
        errors=len(errors),
    )
    report = LeaderPriceIncrementalReport(
        dry_run=dry_run,
        retailer_slug=EXPECTED_RETAILER_SLUG,
        store_slug=EXPECTED_STORE_SLUG,
        collection_report_path=collection.report_path,
        report_path=str(destination),
        metrics=metrics,
        actions=actions,
        import_summary=import_summary,
        errors=errors,
    )
    _write_report(destination, report)
    return report


def plan_incremental_observations(
    collection: LeaderPriceReadonlyRunReport,
    existing_rows: list[dict[str, object]],
) -> tuple[
    list[_PlannedObservation],
    list[_PlannedObservation],
    list[IncrementalAction],
    list[str],
]:
    latest_by_identity = _latest_existing_by_identity(existing_rows)
    candidates: list[_PlannedObservation] = []
    unchanged: list[_PlannedObservation] = []
    actions: list[IncrementalAction] = []
    errors: list[str] = []

    for observation_model in collection.observations:
        if observation_model.is_duplicate:
            continue
        observation = observation_model.to_dict()
        try:
            identity = build_source_product_identity(observation)
        except ValueError as exc:
            identity = "missing-stable-identity"
            action = _action(observation, identity, "unusable_without_price", None, None)
            actions.append(action)
            errors.append(f"unusable_product:{observation.get('product_url') or 'unknown'}:{exc}")
            continue

        if _positive_price(observation.get("current_price")) is None:
            action = _action(observation, identity, "unusable_without_price", None, None)
            actions.append(action)
            errors.append(f"unusable_product:{identity}:missing_current_price")
            continue

        current_fingerprint = build_commercial_fingerprint(observation)
        existing = latest_by_identity.get(identity)
        previous_fingerprint = build_commercial_fingerprint(existing) if existing else None
        if existing is None:
            change_type = "new_product"
        elif previous_fingerprint == current_fingerprint:
            change_type = "unchanged"
        elif existing.get("promotion_proven") is not True and observation.get("promotion_proven") is True:
            change_type = "new_promotion"
        elif existing.get("promotion_proven") is True and observation.get("promotion_proven") is not True:
            change_type = "return_to_normal"
        elif (
            _price_token(existing.get("current_price")) != _price_token(observation.get("current_price"))
            or _price_token(existing.get("original_price")) != _price_token(observation.get("original_price"))
        ):
            change_type = "price_change"
        else:
            change_type = "other_commercial_change"

        action = _action(
            observation,
            identity,
            change_type,
            current_fingerprint,
            previous_fingerprint,
        )
        planned = _PlannedObservation(observation=observation, existing=existing, action=action)
        actions.append(action)
        if change_type == "unchanged":
            unchanged.append(planned)
        else:
            candidates.append(planned)

    return candidates, unchanged, actions, errors


def build_incremental_source_run_id(candidates: list[_PlannedObservation]) -> str:
    if not candidates:
        raise ValueError("leader_price_incremental_has_no_candidates")
    transitions = sorted(
        "|".join(
            [
                item.action.source_identity,
                item.action.commercial_fingerprint or "",
                str((item.existing or {}).get("id") or "initial"),
                item.action.previous_commercial_fingerprint or "initial",
            ]
        )
        for item in candidates
    )
    seed = f"leader-price-commercial-transition-v1|{len(transitions)}|{'::'.join(transitions)}"
    return str(uuid5(NAMESPACE_URL, seed))


def _latest_existing_by_identity(
    existing_rows: list[dict[str, object]],
) -> dict[str, dict[str, object]]:
    latest: dict[str, dict[str, object]] = {}
    for row in existing_rows:
        try:
            identity = build_source_product_identity(row)
        except ValueError:
            continue
        current = latest.get(identity)
        if current is None or _recency_key(row) > _recency_key(current):
            latest[identity] = row
    return latest


def _refresh_unchanged_candidates(
    client: IncrementalClient,
    unchanged: list[_PlannedObservation],
) -> tuple[int, list[str]]:
    by_run: dict[str, list[dict[str, object]]] = {}
    errors: list[str] = []
    for item in unchanged:
        existing = item.existing or {}
        source_run_id = str(existing.get("source_run_id") or "").strip()
        duplicate_key = str(existing.get("duplicate_key") or "").strip()
        if not source_run_id or not duplicate_key:
            errors.append(f"unchanged_refresh_skipped:{item.action.source_identity}:missing_existing_key")
            continue
        rpc_item = to_rpc_item(item.observation)
        rpc_item["duplicate_key"] = duplicate_key
        by_run.setdefault(source_run_id, []).append(rpc_item)

    refreshed = 0
    for source_run_id, rpc_items in by_run.items():
        client.rpc(
            "retail_import_price_candidates",
            {"p_source_run_id": source_run_id, "p_items": rpc_items},
        )
        refreshed += len(rpc_items)
    return refreshed, errors


def _action(
    observation: dict[str, object],
    identity: str,
    change_type: str,
    fingerprint: str | None,
    previous_fingerprint: str | None,
) -> IncrementalAction:
    return IncrementalAction(
        source_identity=identity,
        source_product_id=_text(observation.get("source_product_id")),
        product_url=_text(observation.get("product_url")),
        product_name=_text(observation.get("product_name")),
        change_type=change_type,
        commercial_fingerprint=fingerprint,
        previous_commercial_fingerprint=previous_fingerprint,
    )


def _count_actions(actions: list[IncrementalAction]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for action in actions:
        counts[action.change_type] = counts.get(action.change_type, 0) + 1
    return counts


def _recency_key(row: dict[str, object]) -> tuple[str, str, str]:
    return (
        str(row.get("source_observed_at") or ""),
        str(row.get("created_at") or ""),
        str(row.get("updated_at") or ""),
    )


def _price_token(value: object) -> str | None:
    parsed = _positive_price(value)
    return f"{parsed:.2f}" if parsed is not None else None


def _positive_price(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _build_client(settings: Settings) -> SupabaseAdminClient:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("missing_supabase_admin_env")
    return SupabaseAdminClient(settings.supabase_url, settings.supabase_service_role_key)


def _write_report(path: Path, report: LeaderPriceIncrementalReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
