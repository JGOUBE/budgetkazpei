from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from uuid import NAMESPACE_URL, uuid5

from app.collectors.carrefour_reunion import (
    SOURCE_SCOPES,
    CarrefourReadonlyRunReport,
    run_carrefour_reunion_readonly,
)
from app.db.supabase_client import SupabaseAdminClient
from app.services.leader_price_importer import (
    build_commercial_fingerprint,
    build_source_product_identity,
    to_rpc_item,
)
from app.settings import Settings


EXISTING_COLUMNS = (
    "id,source_run_id,source_product_id,product_url,retailer_slug,store_slug,"
    "duplicate_key,source_observed_at,created_at,updated_at,current_price,original_price,"
    "promotion_proven,promotion_evidence,offer_mechanism,package_format,price_type,starts_at,ends_at,status,"
    "reviewed_at,published_price_observation_id,published_promotion_id"
)
INCREMENTAL_REPORT_NAME = "carrefour-reunion-incremental-report.json"


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
class CarrefourIncrementalAction:
    source_identity: str
    retailer_slug: str
    source_product_id: str | None
    product_name: str | None
    change_type: str
    commercial_fingerprint: str | None
    previous_commercial_fingerprint: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "source_identity": self.source_identity,
            "retailer_slug": self.retailer_slug,
            "source_product_id": self.source_product_id,
            "product_name": self.product_name,
            "change_type": self.change_type,
            "commercial_fingerprint": self.commercial_fingerprint,
            "previous_commercial_fingerprint": self.previous_commercial_fingerprint,
        }


@dataclass(frozen=True)
class CarrefourIncrementalMetrics:
    products_inspected: int
    unique_products: int
    new_products: int
    price_changes: int
    new_promotions: int
    returns_to_normal: int
    other_commercial_changes: int
    catalog_period_updates: int
    catalog_period_unchanged: int
    published_states_preserved: int
    unchanged: int
    unusable_without_price: int
    candidates_to_create: int
    candidates_to_refresh: int
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
            "catalog_period_updates": self.catalog_period_updates,
            "catalog_period_unchanged": self.catalog_period_unchanged,
            "published_states_preserved": self.published_states_preserved,
            "unchanged": self.unchanged,
            "unusable_without_price": self.unusable_without_price,
            "candidates_to_create": self.candidates_to_create,
            "candidates_to_refresh": self.candidates_to_refresh,
            "candidates_created": self.candidates_created,
            "candidates_refreshed": self.candidates_refreshed,
            "errors": self.errors,
        }


@dataclass(frozen=True)
class CarrefourIncrementalReport:
    dry_run: bool
    collection_report_path: str
    baseline_report_path: str | None
    baseline_source: str
    report_path: str
    metrics: CarrefourIncrementalMetrics
    actions: list[CarrefourIncrementalAction]
    import_summary: dict[str, object] | None
    errors: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "dry_run": self.dry_run,
            "mode": "dry-run" if self.dry_run else "real",
            "retailer_slugs": [item[1] for item in SOURCE_SCOPES],
            "scope": "retailer_reunion",
            "store_city": None,
            "collection_report_path": self.collection_report_path,
            "baseline_report_path": self.baseline_report_path,
            "baseline_source": self.baseline_source,
            "report_path": self.report_path,
            "metrics": self.metrics.to_dict(),
            "actions": [item.to_dict() for item in self.actions],
            "import_summary": self.import_summary,
            "errors": list(self.errors),
            "writes": {
                "retail_price_candidates": not self.dry_run and self.import_summary is not None,
                "retail_price_observations": False,
                "market_price_observations": False,
                "shopping_promotions": False,
                "good_deals": False,
            },
        }


@dataclass(frozen=True)
class PlannedCarrefourObservation:
    observation: dict[str, object]
    existing: dict[str, object] | None
    action: CarrefourIncrementalAction


def run_carrefour_reunion_incremental(
    settings: Settings,
    *,
    fetcher: Fetcher,
    dry_run: bool,
    client: IncrementalClient | None = None,
    existing_rows: list[dict[str, object]] | None = None,
    baseline_report_path: Path | None = None,
    report_path: Path | None = None,
) -> CarrefourIncrementalReport:
    collection = run_carrefour_reunion_readonly(settings, fetcher=fetcher)
    admin_client = client
    if existing_rows is not None:
        baseline_rows = list(existing_rows)
        baseline_source = "provided_rows"
    elif baseline_report_path is not None:
        baseline_rows = _load_baseline_observations(baseline_report_path)
        baseline_source = "local_report_simulation"
    else:
        admin_client = admin_client or _build_client(settings)
        baseline_rows = _select_existing_rows(admin_client)
        baseline_source = "supabase"

    candidates, refreshable, actions, planning_errors = plan_carrefour_incremental_observations(
        collection,
        baseline_rows,
    )
    errors = [*collection.errors, *planning_errors]
    import_summary = None
    candidates_created = 0
    candidates_refreshed = 0
    if not dry_run:
        admin_client = admin_client or _build_client(settings)
        candidates_refreshed, refresh_errors = _refresh_existing_candidates(
            admin_client,
            refreshable,
        )
        errors.extend(refresh_errors)
        if candidates:
            source_run_id = build_carrefour_incremental_source_run_id(candidates)
            rpc_items = [
                to_rpc_item(item.observation, default_store_city=None)
                for item in candidates
            ]
            result = admin_client.rpc(
                "retail_import_price_candidates",
                {"p_source_run_id": source_run_id, "p_items": rpc_items},
            )
            if not isinstance(result, dict):
                raise RuntimeError("retail_import_summary_invalid")
            import_summary = {**result, "source_run_id": result.get("source_run_id") or source_run_id}
            candidates_created = _count_value(result.get("imported"))

    counts = _count_actions(actions)
    destination = report_path or settings.report_path.parent / INCREMENTAL_REPORT_NAME
    metrics = CarrefourIncrementalMetrics(
        products_inspected=collection.metrics.cards_detected,
        unique_products=collection.metrics.unique_products,
        new_products=counts.get("new_product", 0),
        price_changes=counts.get("price_change", 0),
        new_promotions=counts.get("new_promotion", 0),
        returns_to_normal=counts.get("return_to_normal", 0),
        other_commercial_changes=counts.get("other_commercial_change", 0),
        catalog_period_updates=counts.get("catalog_period_update", 0),
        catalog_period_unchanged=counts.get("catalog_period_unchanged", 0),
        published_states_preserved=counts.get("published_state_preserved", 0),
        unchanged=counts.get("unchanged", 0),
        unusable_without_price=counts.get("unusable_without_price", 0),
        candidates_to_create=len(candidates),
        candidates_to_refresh=len(refreshable),
        candidates_created=candidates_created,
        candidates_refreshed=candidates_refreshed,
        errors=len(errors),
    )
    report = CarrefourIncrementalReport(
        dry_run=dry_run,
        collection_report_path=collection.report_path,
        baseline_report_path=str(baseline_report_path) if baseline_report_path else None,
        baseline_source=baseline_source,
        report_path=str(destination),
        metrics=metrics,
        actions=actions,
        import_summary=import_summary,
        errors=errors,
    )
    _write_report(destination, report)
    return report


def plan_carrefour_incremental_observations(
    collection: CarrefourReadonlyRunReport,
    existing_rows: list[dict[str, object]],
) -> tuple[
    list[PlannedCarrefourObservation],
    list[PlannedCarrefourObservation],
    list[CarrefourIncrementalAction],
    list[str],
]:
    latest = _latest_existing_by_identity(existing_rows)
    candidates: list[PlannedCarrefourObservation] = []
    refreshable: list[PlannedCarrefourObservation] = []
    actions: list[CarrefourIncrementalAction] = []
    errors: list[str] = []

    for model in collection.observations:
        if model.is_duplicate:
            continue
        observation = model.to_dict()
        try:
            identity = build_source_product_identity(observation)
        except ValueError as exc:
            action = _action(observation, "missing-stable-identity", "unusable_without_price", None, None)
            actions.append(action)
            errors.append(f"unusable_product:{observation.get('raw_product_name')}:{exc}")
            continue
        if _positive_price(observation.get("current_price")) is None:
            action = _action(observation, identity, "unusable_without_price", None, None)
            actions.append(action)
            errors.append(f"unusable_product:{identity}:missing_current_price")
            continue

        current_fingerprint = build_commercial_fingerprint(observation)
        existing = latest.get(identity)
        previous_fingerprint = build_commercial_fingerprint(existing) if existing else None
        if existing is None:
            change_type = "new_product"
        elif _is_published_candidate(existing):
            change_type = "published_state_preserved"
        elif _catalog_period_is_unchanged(existing, observation):
            change_type = "catalog_period_unchanged"
        elif previous_fingerprint == current_fingerprint:
            change_type = "unchanged"
        elif _non_temporal_commercial_fingerprint(existing) == _non_temporal_commercial_fingerprint(observation):
            change_type = "catalog_period_update"
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
        planned = PlannedCarrefourObservation(
            observation=observation,
            existing=existing,
            action=action,
        )
        actions.append(action)
        if change_type in ("published_state_preserved", "catalog_period_unchanged"):
            continue
        if change_type == "unchanged" or (
            change_type == "catalog_period_update"
            and str(existing.get("status") or "").strip() == "needs_review"
        ):
            refreshable.append(planned)
        else:
            candidates.append(planned)
    return candidates, refreshable, actions, errors


def build_carrefour_incremental_source_run_id(
    candidates: list[PlannedCarrefourObservation],
) -> str:
    if not candidates:
        raise ValueError("carrefour_incremental_has_no_candidates")
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
    seed = f"carrefour-reunion-commercial-transition-v1|{len(transitions)}|{'::'.join(transitions)}"
    return str(uuid5(NAMESPACE_URL, seed))


def _select_existing_rows(client: IncrementalClient) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for _url, retailer_slug, _name in SOURCE_SCOPES:
        rows.extend(
            client.select(
                "retail_price_candidates",
                filters={
                    "retailer_slug": f"eq.{retailer_slug}",
                    "store_slug": f"eq.{retailer_slug}",
                    "order": "source_observed_at.desc,created_at.desc",
                    "limit": "10000",
                },
                columns=EXISTING_COLUMNS,
            )
        )
    return rows


def _load_baseline_observations(path: Path) -> list[dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    observations = data.get("observations") if isinstance(data, dict) else None
    if not isinstance(observations, list):
        raise ValueError("carrefour_baseline_report_missing_observations")
    return [item for item in observations if isinstance(item, dict) and not item.get("is_duplicate")]


def _refresh_existing_candidates(
    client: IncrementalClient,
    refreshable: list[PlannedCarrefourObservation],
) -> tuple[int, list[str]]:
    by_run: dict[str, list[dict[str, object]]] = {}
    errors: list[str] = []
    for item in refreshable:
        existing = item.existing or {}
        source_run_id = str(existing.get("source_run_id") or "").strip()
        duplicate_key = str(existing.get("duplicate_key") or "").strip()
        if not source_run_id or not duplicate_key:
            errors.append(f"unchanged_refresh_skipped:{item.action.source_identity}:missing_existing_key")
            continue
        rpc_item = to_rpc_item(item.observation, default_store_city=None)
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


def _non_temporal_commercial_fingerprint(item: dict[str, object]) -> str:
    without_period = {**item, "starts_at": None, "ends_at": None}
    return build_commercial_fingerprint(without_period)


def _catalog_period_is_unchanged(
    existing: dict[str, object],
    observation: dict[str, object],
) -> bool:
    proposed_starts_at = _period_token(observation.get("starts_at"))
    proposed_ends_at = _period_token(observation.get("ends_at"))
    if proposed_starts_at is None or proposed_ends_at is None:
        return False
    return (
        _period_token(existing.get("starts_at")) == proposed_starts_at
        and _period_token(existing.get("ends_at")) == proposed_ends_at
        and _catalog_evidence(existing) == _catalog_evidence(observation)
    )


def _catalog_evidence(item: dict[str, object]) -> dict[str, object] | None:
    evidence = item.get("promotion_evidence")
    if isinstance(evidence, dict):
        return evidence if isinstance(evidence.get("catalog"), dict) else None
    try:
        proposed = to_rpc_item(item, default_store_city=None).get("promotion_evidence")
    except (KeyError, TypeError, ValueError):
        return None
    return proposed if isinstance(proposed, dict) and isinstance(proposed.get("catalog"), dict) else None


def _period_token(value: object) -> str | None:
    text = _text(value)
    if text is None:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return text
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    if parsed.hour == parsed.minute == parsed.second == parsed.microsecond == 0:
        return parsed.date().isoformat()
    return parsed.isoformat(timespec="microseconds")


def _is_published_candidate(existing: dict[str, object]) -> bool:
    return str(existing.get("status") or "").strip() == "published"


def _latest_existing_by_identity(
    rows: list[dict[str, object]],
) -> dict[str, dict[str, object]]:
    latest: dict[str, dict[str, object]] = {}
    for row in rows:
        try:
            identity = build_source_product_identity(row)
        except ValueError:
            continue
        current = latest.get(identity)
        if current is None or _recency_key(row) > _recency_key(current):
            latest[identity] = row
    return latest


def _action(
    observation: dict[str, object],
    identity: str,
    change_type: str,
    fingerprint: str | None,
    previous_fingerprint: str | None,
) -> CarrefourIncrementalAction:
    return CarrefourIncrementalAction(
        source_identity=identity,
        retailer_slug=str(observation.get("retailer_slug") or ""),
        source_product_id=_text(observation.get("source_product_id")),
        product_name=_text(observation.get("product_name")),
        change_type=change_type,
        commercial_fingerprint=fingerprint,
        previous_commercial_fingerprint=previous_fingerprint,
    )


def _count_actions(actions: list[CarrefourIncrementalAction]) -> dict[str, int]:
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


def _count_value(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _build_client(settings: Settings) -> SupabaseAdminClient:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("missing_supabase_admin_env")
    return SupabaseAdminClient(settings.supabase_url, settings.supabase_service_role_key)


def _write_report(path: Path, report: CarrefourIncrementalReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
