from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from uuid import NAMESPACE_URL, uuid5

from app.collectors.eleclerc_drive_reunion import (
    PILOT_STORE,
    RETAILER_SLUG,
    LeclercReadonlyRunReport,
    run_eleclerc_reunion_readonly,
)
from app.db.supabase_client import SupabaseAdminClient
from app.services.leader_price_importer import (
    build_commercial_fingerprint,
    build_source_product_identity,
    to_rpc_item,
)
from app.settings import Settings


EXISTING_COLUMNS = (
    "id,source_run_id,source_type,source_product_id,source_url,product_url,retailer_slug,"
    "store_slug,duplicate_key,source_observed_at,created_at,updated_at,current_price,"
    "original_price,promotion_proven,promotion_evidence,offer_mechanism,package_format,"
    "price_type,starts_at,ends_at,status,reviewed_at,published_price_observation_id,"
    "published_promotion_id"
)
INCREMENTAL_REPORT_NAME = "eleclerc-reunion-drive-incremental-report.json"


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
class LeclercIncrementalAction:
    source_identity: str
    source_product_id: str | None
    product_name: str | None
    change_type: str
    commercial_fingerprint: str | None
    previous_commercial_fingerprint: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "source_identity": self.source_identity,
            "source_product_id": self.source_product_id,
            "product_name": self.product_name,
            "change_type": self.change_type,
            "commercial_fingerprint": self.commercial_fingerprint,
            "previous_commercial_fingerprint": self.previous_commercial_fingerprint,
        }


@dataclass(frozen=True)
class PlannedLeclercObservation:
    observation: dict[str, object]
    existing: dict[str, object] | None
    action: LeclercIncrementalAction


@dataclass(frozen=True)
class LeclercIncrementalMetrics:
    products_inspected: int
    unique_products: int
    existing_candidates: int
    new_products: int
    price_changes: int
    new_promotions: int
    returns_to_normal: int
    other_commercial_changes: int
    unchanged: int
    published_states_preserved: int
    unusable_without_price: int
    candidates_to_create: int
    candidates_created: int
    errors: int

    def to_dict(self) -> dict[str, int]:
        return {
            "products_inspected": self.products_inspected,
            "unique_products": self.unique_products,
            "existing_candidates": self.existing_candidates,
            "new_products": self.new_products,
            "price_changes": self.price_changes,
            "new_promotions": self.new_promotions,
            "returns_to_normal": self.returns_to_normal,
            "other_commercial_changes": self.other_commercial_changes,
            "unchanged": self.unchanged,
            "published_states_preserved": self.published_states_preserved,
            "unusable_without_price": self.unusable_without_price,
            "candidates_to_create": self.candidates_to_create,
            "candidates_created": self.candidates_created,
            "errors": self.errors,
        }


@dataclass(frozen=True)
class LeclercIncrementalReport:
    dry_run: bool
    collection_report_path: str
    baseline_report_path: str | None
    baseline_source: str
    existing_candidate_count: int
    market_store_mapping: dict[str, object] | None
    report_path: str
    metrics: LeclercIncrementalMetrics
    actions: list[LeclercIncrementalAction]
    import_summary: dict[str, object] | None
    errors: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "dry_run": self.dry_run,
            "mode": "dry-run" if self.dry_run else "real",
            "retailer_slug": RETAILER_SLUG,
            "store_slug": PILOT_STORE.slug,
            "store_source_id": PILOT_STORE.source_id,
            "collection_report_path": self.collection_report_path,
            "baseline_report_path": self.baseline_report_path,
            "baseline_source": self.baseline_source,
            "existing_candidate_count": self.existing_candidate_count,
            "market_store_mapping": self.market_store_mapping,
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
            "automatic_publication": False,
        }


def run_eleclerc_reunion_incremental(
    settings: Settings,
    *,
    fetcher: Fetcher,
    dry_run: bool,
    store_slug: str = PILOT_STORE.slug,
    max_products: int = 100,
    client: IncrementalClient | None = None,
    existing_rows: list[dict[str, object]] | None = None,
    baseline_report_path: Path | None = None,
    report_path: Path | None = None,
) -> LeclercIncrementalReport:
    collection = run_eleclerc_reunion_readonly(
        settings,
        fetcher=fetcher,
        store_slug=store_slug,
        max_products=max_products,
    )
    admin_client = client
    mapping = None
    if existing_rows is not None:
        baseline_rows = list(existing_rows)
        baseline_source = "provided_rows"
    elif baseline_report_path is not None:
        baseline_rows = _load_baseline_observations(baseline_report_path)
        baseline_source = "local_report_simulation"
    else:
        admin_client = admin_client or _build_client(settings)
        baseline_rows = _select_existing_rows(admin_client, store_slug=store_slug)
        baseline_source = "supabase"
        mapping = _select_market_store_mapping(admin_client, store_slug=store_slug)

    candidates, actions, planning_errors = plan_eleclerc_incremental_observations(
        collection,
        baseline_rows,
    )
    errors = [*collection.errors, *planning_errors]
    import_summary = None
    candidates_created = 0
    if not dry_run and candidates:
        admin_client = admin_client or _build_client(settings)
        source_run_id = build_eleclerc_incremental_source_run_id(candidates)
        rpc_items = [
            to_rpc_item(item.observation, default_store_city=PILOT_STORE.city)
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
    metrics = LeclercIncrementalMetrics(
        products_inspected=collection.metrics.inspected,
        unique_products=collection.metrics.unique,
        existing_candidates=len(baseline_rows),
        new_products=counts.get("new_product", 0),
        price_changes=counts.get("price_change", 0),
        new_promotions=counts.get("new_promotion", 0),
        returns_to_normal=counts.get("return_to_normal", 0),
        other_commercial_changes=counts.get("other_commercial_change", 0),
        unchanged=counts.get("unchanged", 0),
        published_states_preserved=counts.get("published_state_preserved", 0),
        unusable_without_price=counts.get("unusable_without_price", 0),
        candidates_to_create=len(candidates),
        candidates_created=candidates_created,
        errors=len(errors),
    )
    report = LeclercIncrementalReport(
        dry_run=dry_run,
        collection_report_path=collection.report_path,
        baseline_report_path=str(baseline_report_path) if baseline_report_path else None,
        baseline_source=baseline_source,
        existing_candidate_count=len(baseline_rows),
        market_store_mapping=mapping,
        report_path=str(destination),
        metrics=metrics,
        actions=actions,
        import_summary=import_summary,
        errors=errors,
    )
    _write_report(destination, report)
    return report


def plan_eleclerc_incremental_observations(
    collection: LeclercReadonlyRunReport,
    existing_rows: list[dict[str, object]],
) -> tuple[list[PlannedLeclercObservation], list[LeclercIncrementalAction], list[str]]:
    latest = _latest_existing_by_identity(existing_rows)
    candidates: list[PlannedLeclercObservation] = []
    actions: list[LeclercIncrementalAction] = []
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
        elif str(existing.get("status") or "").strip() == "published":
            change_type = "published_state_preserved"
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
        actions.append(action)
        if change_type not in {"unchanged", "published_state_preserved"}:
            candidates.append(
                PlannedLeclercObservation(
                    observation=observation,
                    existing=existing,
                    action=action,
                )
            )
    return candidates, actions, errors


def build_eleclerc_incremental_source_run_id(
    candidates: list[PlannedLeclercObservation],
) -> str:
    if not candidates:
        raise ValueError("eleclerc_incremental_has_no_candidates")
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
    seed = f"eleclerc-reunion-drive-commercial-transition-v1|{len(transitions)}|{'::'.join(transitions)}"
    return str(uuid5(NAMESPACE_URL, seed))


def _select_existing_rows(
    client: IncrementalClient,
    *,
    store_slug: str,
) -> list[dict[str, object]]:
    return client.select(
        "retail_price_candidates",
        filters={
            "retailer_slug": f"eq.{RETAILER_SLUG}",
            "store_slug": f"eq.{store_slug}",
            "order": "source_observed_at.desc,created_at.desc",
            "limit": "10000",
        },
        columns=EXISTING_COLUMNS,
    )


def _select_market_store_mapping(
    client: IncrementalClient,
    *,
    store_slug: str,
) -> dict[str, object] | None:
    mapping_error = None
    try:
        mappings = client.select(
            "retail_market_store_mappings",
            filters={
                "retailer_slug": f"eq.{RETAILER_SLUG}",
                "store_slug": f"eq.{store_slug}",
                "limit": "1",
            },
            columns="retailer_slug,store_slug,market_store_id",
        )
    except Exception as exc:  # API grants can intentionally hide this admin-only table.
        mappings = []
        mapping_error = f"{type(exc).__name__}:{exc}"

    mapping = mappings[0] if mappings else None
    market_store_id = str((mapping or {}).get("market_store_id") or "").strip()
    if market_store_id:
        stores = client.select(
            "market_stores",
            filters={"id": f"eq.{market_store_id}", "limit": "1"},
            columns="id,store_name,city,normalized_store_name,normalized_city,store_key",
        )
    else:
        stores = client.select(
            "market_stores",
            filters={
                "normalized_store_name": "eq.e leclerc le portail",
                "normalized_city": "eq.saint leu",
                "limit": "2",
            },
            columns="id,store_name,city,normalized_store_name,normalized_city,store_key",
        )
    if not mapping and not stores and not mapping_error:
        return None
    return {
        "retailer_slug": RETAILER_SLUG,
        "store_slug": store_slug,
        "market_store_id": market_store_id or (stores[0].get("id") if len(stores) == 1 else None),
        "market_store": stores[0] if len(stores) == 1 else None,
        "mapping_verified": mapping is not None,
        "resolution": "explicit_mapping" if mapping else "existing_market_store_exact_name_city",
        "mapping_read_error": mapping_error,
    }


def _load_baseline_observations(path: Path) -> list[dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    observations = data.get("observations") if isinstance(data, dict) else None
    if not isinstance(observations, list):
        raise ValueError("eleclerc_baseline_report_missing_observations")
    return [item for item in observations if isinstance(item, dict) and not item.get("is_duplicate")]


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
) -> LeclercIncrementalAction:
    return LeclercIncrementalAction(
        source_identity=identity,
        source_product_id=_text(observation.get("source_product_id")),
        product_name=_text(observation.get("product_name")),
        change_type=change_type,
        commercial_fingerprint=fingerprint,
        previous_commercial_fingerprint=previous_fingerprint,
    )


def _count_actions(actions: list[LeclercIncrementalAction]) -> dict[str, int]:
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
    price = _positive_price(value)
    return f"{price:.2f}" if price is not None else None


def _positive_price(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


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


def _write_report(path: Path, report: LeclercIncrementalReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
