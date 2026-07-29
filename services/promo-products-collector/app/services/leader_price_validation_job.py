from __future__ import annotations

import json
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Protocol

from app.collectors.leader_price_reunion import LeaderPriceReadonlyRunReport, run_leader_price_readonly
from app.db.supabase_client import SupabaseAdminClient
from app.models.retail_price_observation import RetailPriceObservation
from app.services.leader_price_importer import (
    LeaderPriceImportSummary,
    build_source_run_id,
    import_leader_price_report,
)
from app.settings import Settings


MAX_LEADER_PRICE_PRODUCTS = 100
EXPECTED_RETAILER_SLUG = "leader-price-reunion"
EXPECTED_STORE_SLUG = "leaderprice-lp-ermitage"
EXPECTED_STORE_NAME = "LP Ermitage"


class Fetcher(Protocol):
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings): ...


class AdminClient(Protocol):
    def count(self, table: str, *, filters: dict[str, str] | None = None) -> int: ...
    def select(self, table: str, *, filters: dict[str, str] | None = None, columns: str = "*") -> list[dict[str, object]]: ...


class ReadonlyRunner(Protocol):
    def __call__(
        self,
        settings: Settings,
        *,
        fetcher: Fetcher,
        max_products: int,
    ) -> LeaderPriceReadonlyRunReport: ...


class ImportRunner(Protocol):
    def __call__(
        self,
        settings: Settings,
        *,
        report_path: Path | None = None,
        max_products: int = MAX_LEADER_PRICE_PRODUCTS,
        client: object | None = None,
    ) -> LeaderPriceImportSummary: ...


@dataclass(frozen=True)
class LeaderPriceValidationBaseline:
    source_run_id: str
    retail_price_candidates_total: int
    retail_price_observations_total: int
    retail_price_candidates_leader_price: int
    retail_price_candidates_lp_ermitage: int
    retail_price_candidates_current_run: int
    shopping_promotions_leader_price: int
    shopping_products_leader_price: int
    market_products_total: int
    market_product_aliases_total: int
    market_manual_product_aliases_total: int

    def to_dict(self) -> dict[str, object]:
        return {
            "source_run_id": self.source_run_id,
            "retail_price_candidates_total": self.retail_price_candidates_total,
            "retail_price_observations_total": self.retail_price_observations_total,
            "retail_price_candidates_leader_price": self.retail_price_candidates_leader_price,
            "retail_price_candidates_lp_ermitage": self.retail_price_candidates_lp_ermitage,
            "retail_price_candidates_current_run": self.retail_price_candidates_current_run,
            "shopping_promotions_leader_price": self.shopping_promotions_leader_price,
            "shopping_products_leader_price": self.shopping_products_leader_price,
            "market_products_total": self.market_products_total,
            "market_product_aliases_total": self.market_product_aliases_total,
            "market_manual_product_aliases_total": self.market_manual_product_aliases_total,
        }


@dataclass(frozen=True)
class LeaderPriceValidationPostImport:
    retail_price_candidates_total: int
    retail_price_observations_total: int
    retail_price_candidates_current_run: int
    retail_price_candidates_current_run_observed_price: int
    retail_price_candidates_current_run_promotion: int
    shopping_promotions_leader_price: int
    shopping_products_leader_price: int
    invalid_price_candidates: int
    invalid_promotion_candidates: int
    missing_source_product_id: int
    missing_product_url: int
    missing_duplicate_key: int
    wrong_retailer_rows: int
    wrong_store_rows: int
    external_image_url_rows: int
    storage_write_attempted: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "retail_price_candidates_total": self.retail_price_candidates_total,
            "retail_price_observations_total": self.retail_price_observations_total,
            "retail_price_candidates_current_run": self.retail_price_candidates_current_run,
            "retail_price_candidates_current_run_observed_price": self.retail_price_candidates_current_run_observed_price,
            "retail_price_candidates_current_run_promotion": self.retail_price_candidates_current_run_promotion,
            "shopping_promotions_leader_price": self.shopping_promotions_leader_price,
            "shopping_products_leader_price": self.shopping_products_leader_price,
            "invalid_price_candidates": self.invalid_price_candidates,
            "invalid_promotion_candidates": self.invalid_promotion_candidates,
            "missing_source_product_id": self.missing_source_product_id,
            "missing_product_url": self.missing_product_url,
            "missing_duplicate_key": self.missing_duplicate_key,
            "wrong_retailer_rows": self.wrong_retailer_rows,
            "wrong_store_rows": self.wrong_store_rows,
            "external_image_url_rows": self.external_image_url_rows,
            "storage_write_attempted": self.storage_write_attempted,
        }


@dataclass(frozen=True)
class LeaderPriceValidationJobReport:
    mode: str
    readonly_metrics: dict[str, object]
    baseline: LeaderPriceValidationBaseline
    first_import: LeaderPriceImportSummary
    post_import: LeaderPriceValidationPostImport
    report_path: str
    errors: list[str]
    temporary_files_remaining: int

    def to_dict(self) -> dict[str, object]:
        return {
            "mode": self.mode,
            "readonly_metrics": dict(self.readonly_metrics),
            "baseline": self.baseline.to_dict(),
            "first_import": self.first_import.to_dict(),
            "post_import": self.post_import.to_dict(),
            "report_path": self.report_path,
            "errors": list(self.errors),
            "temporary_files_remaining": self.temporary_files_remaining,
        }


def run_leader_price_validation_job(
    settings: Settings,
    *,
    fetcher: Fetcher,
    admin_client: AdminClient | None = None,
    readonly_runner: ReadonlyRunner = run_leader_price_readonly,
    import_runner: ImportRunner = import_leader_price_report,
) -> LeaderPriceValidationJobReport:
    job_settings = replace(
        settings,
        dry_run=True,
        request_timeout_seconds=max(settings.request_timeout_seconds, 90),
        domain_delay_seconds=max(settings.domain_delay_seconds, 1.5),
        vision_enabled=False,
    )
    report_root = job_settings.report_path.parent
    report_root.mkdir(parents=True, exist_ok=True)
    _cleanup_temp_dir(job_settings.temp_dir)
    errors: list[str] = []
    validation_report: LeaderPriceValidationJobReport | None = None

    try:
        readonly_report = readonly_runner(
            job_settings,
            fetcher=fetcher,
            max_products=MAX_LEADER_PRICE_PRODUCTS,
        )
        readonly_metrics = _readonly_metrics(readonly_report)
        _validate_readonly_report(readonly_report, readonly_metrics)

        source_run_id = build_source_run_id(
            [observation.to_dict() for observation in readonly_report.observations[:MAX_LEADER_PRICE_PRODUCTS]]
        )
        admin_client = admin_client or _build_admin_client(job_settings)
        baseline = collect_validation_baseline(admin_client, source_run_id=source_run_id)

        import_summary = import_runner(
            job_settings,
            report_path=Path(readonly_report.report_path),
            max_products=MAX_LEADER_PRICE_PRODUCTS,
            client=admin_client,
        )
        post_import = collect_post_import_checks(admin_client, source_run_id=source_run_id)
        if import_summary.source_run_id != source_run_id:
            raise RuntimeError("leader_price_validation_job_source_run_id_mismatch")
        _validate_post_import(post_import, baseline=baseline)

        validation_report = LeaderPriceValidationJobReport(
            mode="leader-price-validation-job",
            readonly_metrics=readonly_metrics,
            baseline=baseline,
            first_import=import_summary,
            post_import=post_import,
            report_path=str(report_root / "leader-price-import-validation-report.json"),
            errors=errors,
            temporary_files_remaining=0,
        )
        _write_non_sensitive_report(Path(validation_report.report_path), validation_report)
    finally:
        _cleanup_temp_dir(job_settings.temp_dir)

    if validation_report is None:
        raise RuntimeError("leader_price_validation_job_missing_report")

    return replace(
        validation_report,
        temporary_files_remaining=_remaining_temp_files(job_settings.temp_dir),
    )


def build_validation_job_smoke_report(settings: Settings) -> LeaderPriceValidationJobReport:
    return run_leader_price_validation_job(
        settings,
        fetcher=_SmokeFetcher(),
        admin_client=_SmokeAdminClient(),
        readonly_runner=_smoke_readonly_runner,
        import_runner=_smoke_import_runner,
    )


def collect_validation_baseline(
    admin_client: AdminClient,
    *,
    source_run_id: str,
) -> LeaderPriceValidationBaseline:
    leader_promotions = admin_client.select(
        "shopping_promotions",
        filters={"collector_source_slug": "eq.leader-price-reunion-retail"},
        columns="id,product_id",
    )
    return LeaderPriceValidationBaseline(
        source_run_id=source_run_id,
        retail_price_candidates_total=admin_client.count("retail_price_candidates"),
        retail_price_observations_total=admin_client.count("retail_price_observations"),
        retail_price_candidates_leader_price=admin_client.count(
            "retail_price_candidates",
            filters={"retailer_slug": "eq.leader-price-reunion"},
        ),
        retail_price_candidates_lp_ermitage=admin_client.count(
            "retail_price_candidates",
            filters={"store_slug": "eq.leaderprice-lp-ermitage"},
        ),
        retail_price_candidates_current_run=admin_client.count(
            "retail_price_candidates",
            filters={"source_run_id": f"eq.{source_run_id}"},
        ),
        shopping_promotions_leader_price=len(leader_promotions),
        shopping_products_leader_price=len({row.get("product_id") for row in leader_promotions if row.get("product_id")}),
        market_products_total=admin_client.count("market_products"),
        market_product_aliases_total=admin_client.count("market_product_aliases"),
        market_manual_product_aliases_total=admin_client.count("market_manual_product_aliases"),
    )


def collect_post_import_checks(
    admin_client: AdminClient,
    *,
    source_run_id: str,
) -> LeaderPriceValidationPostImport:
    current_run_rows = admin_client.select(
        "retail_price_candidates",
        filters={"source_run_id": f"eq.{source_run_id}"},
        columns=(
            "id,retailer_slug,store_slug,store_name,source_product_id,product_url,"
            "duplicate_key,current_price,price_type,promotion_proven,promotion_evidence,image_url"
        ),
    )
    leader_promotions = admin_client.select(
        "shopping_promotions",
        filters={"collector_source_slug": "eq.leader-price-reunion-retail"},
        columns="id,product_id",
    )
    invalid_price = 0
    invalid_promotion = 0
    missing_source_product_id = 0
    missing_product_url = 0
    missing_duplicate_key = 0
    wrong_retailer_rows = 0
    wrong_store_rows = 0
    external_image_url_rows = 0
    observed_total = 0
    promotion_total = 0
    for row in current_run_rows:
        price = row.get("current_price")
        price_value = float(price) if isinstance(price, (int, float, str)) and str(price).strip() else None
        if price_value is None or price_value <= 0:
            invalid_price += 1
        if row.get("price_type") == "observed_price":
            observed_total += 1
        if row.get("price_type") == "promotion":
            promotion_total += 1
            if row.get("promotion_proven") is not True or not row.get("promotion_evidence"):
                invalid_promotion += 1
        if not row.get("source_product_id"):
            missing_source_product_id += 1
        if not row.get("product_url"):
            missing_product_url += 1
        if not row.get("duplicate_key"):
            missing_duplicate_key += 1
        if row.get("retailer_slug") != EXPECTED_RETAILER_SLUG:
            wrong_retailer_rows += 1
        if row.get("store_slug") != EXPECTED_STORE_SLUG or row.get("store_name") != EXPECTED_STORE_NAME:
            wrong_store_rows += 1
        image_url = str(row.get("image_url") or "").strip()
        if image_url.lower().startswith("https://"):
            external_image_url_rows += 1
    return LeaderPriceValidationPostImport(
        retail_price_candidates_total=admin_client.count("retail_price_candidates"),
        retail_price_observations_total=admin_client.count("retail_price_observations"),
        retail_price_candidates_current_run=len(current_run_rows),
        retail_price_candidates_current_run_observed_price=observed_total,
        retail_price_candidates_current_run_promotion=promotion_total,
        shopping_promotions_leader_price=len(leader_promotions),
        shopping_products_leader_price=len({row.get("product_id") for row in leader_promotions if row.get("product_id")}),
        invalid_price_candidates=invalid_price,
        invalid_promotion_candidates=invalid_promotion,
        missing_source_product_id=missing_source_product_id,
        missing_product_url=missing_product_url,
        missing_duplicate_key=missing_duplicate_key,
        wrong_retailer_rows=wrong_retailer_rows,
        wrong_store_rows=wrong_store_rows,
        external_image_url_rows=external_image_url_rows,
        storage_write_attempted=False,
    )


def _readonly_metrics(report: LeaderPriceReadonlyRunReport) -> dict[str, object]:
    unique_observations = [item for item in report.observations if not item.is_duplicate]
    observed_total = len([item for item in unique_observations if item.price_type == "observed_price"])
    promotion_total = len([item for item in unique_observations if item.price_type == "promotion"])
    return {
        "store_name": report.store.name,
        "store_city": report.store.city,
        "products_detected": report.deduplication.total_input,
        "unique_products": report.deduplication.unique_observations,
        "observed_prices": observed_total,
        "promotions_proven": promotion_total,
        "duplicates": report.deduplication.duplicates,
        "incomplete_products": len([item for item in unique_observations if item.validation_errors]),
        "classification": report.classification,
        "external_cost_eur": report.external_cost_eur,
        "request_count": report.request_count,
        "duration_seconds": report.duration_seconds,
        "report_path": report.report_path,
    }


def _validate_readonly_report(
    report: LeaderPriceReadonlyRunReport,
    readonly_metrics: dict[str, object],
) -> None:
    unique_observations = [item for item in report.observations if not item.is_duplicate]
    unique_total = int(readonly_metrics["unique_products"])
    if unique_total <= 0:
        raise RuntimeError("leader_price_validation_job_no_unique_products")
    if unique_total > MAX_LEADER_PRICE_PRODUCTS:
        raise RuntimeError("leader_price_validation_job_exceeds_max_products")
    observed_total = int(readonly_metrics["observed_prices"])
    promotion_total = int(readonly_metrics["promotions_proven"])
    if observed_total + promotion_total != unique_total:
        raise RuntimeError("leader_price_validation_job_price_type_totals_mismatch")
    for observation in unique_observations:
        if observation.current_price is None or observation.current_price <= 0:
            raise RuntimeError("leader_price_validation_job_invalid_current_price")
        if observation.price_type == "promotion" and (
            observation.promotion_proven is not True or not observation.promotion_evidence
        ):
            raise RuntimeError("leader_price_validation_job_promotion_without_proof")


def _validate_post_import(
    post_import: LeaderPriceValidationPostImport,
    *,
    baseline: LeaderPriceValidationBaseline,
) -> None:
    if post_import.retail_price_candidates_current_run <= 0:
        raise RuntimeError("leader_price_validation_job_post_import_empty_run")
    if post_import.retail_price_candidates_current_run > MAX_LEADER_PRICE_PRODUCTS:
        raise RuntimeError("leader_price_validation_job_post_import_exceeds_max_products")
    if (
        post_import.retail_price_candidates_current_run_observed_price
        + post_import.retail_price_candidates_current_run_promotion
        != post_import.retail_price_candidates_current_run
    ):
        raise RuntimeError("leader_price_validation_job_post_import_price_type_totals_mismatch")
    if post_import.invalid_price_candidates != 0:
        raise RuntimeError("leader_price_validation_job_post_import_invalid_price")
    if post_import.invalid_promotion_candidates != 0:
        raise RuntimeError("leader_price_validation_job_post_import_invalid_promotion")
    if post_import.missing_source_product_id != 0:
        raise RuntimeError("leader_price_validation_job_missing_source_product_id")
    if post_import.missing_product_url != 0:
        raise RuntimeError("leader_price_validation_job_missing_product_url")
    if post_import.missing_duplicate_key != 0:
        raise RuntimeError("leader_price_validation_job_missing_duplicate_key")
    if post_import.wrong_retailer_rows != 0:
        raise RuntimeError("leader_price_validation_job_wrong_retailer")
    if post_import.wrong_store_rows != 0:
        raise RuntimeError("leader_price_validation_job_wrong_store")
    if post_import.shopping_promotions_leader_price != baseline.shopping_promotions_leader_price:
        raise RuntimeError("leader_price_validation_job_unexpected_promotion_publication")
    if post_import.storage_write_attempted:
        raise RuntimeError("leader_price_validation_job_unexpected_storage_write")


def _build_admin_client(settings: Settings) -> SupabaseAdminClient:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("missing_supabase_admin_env")
    return SupabaseAdminClient(settings.supabase_url, settings.supabase_service_role_key)


def _write_non_sensitive_report(path: Path, report: LeaderPriceValidationJobReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def _remaining_temp_files(temp_dir: Path) -> int:
    return len(list(temp_dir.iterdir())) if temp_dir.exists() else 0


def _cleanup_temp_dir(temp_dir: Path) -> None:
    if not temp_dir.exists():
        return
    for child in temp_dir.iterdir():
        if child.is_file():
            child.unlink()
        elif child.is_dir():
            for nested in sorted(child.rglob("*"), reverse=True):
                if nested.is_file():
                    nested.unlink()
                elif nested.is_dir():
                    nested.rmdir()
            child.rmdir()
    temp_dir.rmdir()


def _smoke_import_runner(
    settings: Settings,
    *,
    report_path: Path | None = None,
    max_products: int = MAX_LEADER_PRICE_PRODUCTS,
    client: object | None = None,
) -> LeaderPriceImportSummary:
    source_run_id = "smoke-run-id"
    if isinstance(client, _SmokeAdminClient) and report_path is not None:
        source_run_id = client.record_import(report_path=report_path, max_products=max_products)
    return LeaderPriceImportSummary(
        source_run_id=source_run_id,
        retailer_slug=EXPECTED_RETAILER_SLUG,
        store_slug=EXPECTED_STORE_SLUG,
        imported=max_products,
        updated=0,
        unchanged=0,
        duplicate=0,
        rejected=0,
        needs_review=0,
        imported_items=max_products,
        report_path=str(report_path or settings.report_path),
    )


def _smoke_readonly_runner(
    settings: Settings,
    *,
    fetcher: Fetcher,
    max_products: int,
) -> LeaderPriceReadonlyRunReport:
    report_root = settings.report_path.parent
    report_root.mkdir(parents=True, exist_ok=True)
    report_path = report_root / "leader-price-reunion-readonly.json"
    summary_path = report_root / "leader-price-reunion-readonly-summary.md"
    observations = [_build_smoke_observation(index) for index in range(max_products)]
    report_path.write_text(
        json.dumps(
            {
                "store": {
                    "slug": EXPECTED_STORE_SLUG,
                    "name": EXPECTED_STORE_NAME,
                    "city": "Saint-Gilles Les Bains",
                },
                "observations": [observation.to_dict() for observation in observations],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    summary_path.write_text("VALIDATION_JOB_SMOKE_OK\n", encoding="utf-8")
    return LeaderPriceReadonlyRunReport(
        store=_SmokeStore(),
        visited_urls=["https://leaderdrive.re/", "https://leaderdrive.re/leaderprice-lp-ermitage/promotions"],
        audited_categories=[],
        page_audits=[],
        observations=observations,
        deduplication=_SmokeDeduplication(total_input=max_products, unique_observations=max_products),
        matching=_SmokeMatching(),
        human_audit=[],
        report_path=str(report_path),
        summary_path=str(summary_path),
        request_count=12,
        duration_seconds=0.25,
        classification="A",
        external_cost_eur=0.0,
        errors=[],
    )


def _build_smoke_observation(index: int) -> RetailPriceObservation:
    is_promotion = index < 20
    return RetailPriceObservation(
        source_type="leader_drive_html",
        source_url="https://leaderdrive.re/leaderprice-lp-ermitage/promotions",
        source_product_id=f"SMOKE-{index:03d}",
        source_category_id="PROMOTIONS",
        source_observed_at=f"2026-07-29T10:{index % 60:02d}:00Z",
        retailer_slug=EXPECTED_RETAILER_SLUG,
        retailer_name="Leader Price Reunion",
        store_slug=EXPECTED_STORE_SLUG,
        store_name=EXPECTED_STORE_NAME,
        channel="public_drive",
        raw_product_name=f"Produit smoke {index}",
        product_name=f"Produit smoke {index}",
        normalized_product_name=f"produit smoke {index}",
        brand="Leader",
        package_format="500 g",
        quantity_value=500,
        quantity_unit="g",
        pack_count=1,
        total_quantity_value=500,
        total_quantity_unit="g",
        barcode=None,
        category="epicerie",
        subcategory="promotions" if is_promotion else "epicerie",
        image_url=f"https://leaderdrive.re/images/smoke-{index}.png",
        product_url=f"https://leaderdrive.re/articles/smoke-{index}",
        current_price=2.99,
        original_price=3.49 if is_promotion else None,
        unit_price=5.98,
        unit_price_unit="kg",
        currency="EUR",
        price_type="promotion" if is_promotion else "observed_price",
        promotion_proven=is_promotion,
        promotion_evidence="badge_old_price" if is_promotion else None,
        promo_badge="Promo" if is_promotion else None,
        discount_percent=14.3 if is_promotion else None,
        loyalty_amount=None,
        loyalty_type=None,
        offer_mechanism="direct_discount" if is_promotion else None,
        conditions=None,
        starts_at=None,
        ends_at=None,
        extraction_confidence=95,
        validation_errors=[],
        availability_status="available",
        raw_evidence={"source": "smoke"},
        duplicate_key=f"{EXPECTED_STORE_SLUG}|SMOKE-{index:03d}",
    )


class _SmokeFetcher:
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings):
        raise AssertionError(f"smoke_fetch_unexpected:{url}")


class _SmokeAdminClient:
    def __init__(self) -> None:
        self._current_run_source_run_id: str | None = None
        self._current_run_rows: list[dict[str, object]] = []

    def record_import(self, *, report_path: Path, max_products: int) -> str:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
        observations = list(payload.get("observations") or [])[:max_products]
        self._current_run_source_run_id = build_source_run_id(observations)
        self._current_run_rows = [
            {
                "id": f"row-{index}",
                "retailer_slug": str(item["retailer_slug"]),
                "store_slug": str(item["store_slug"]),
                "store_name": str(item["store_name"]),
                "source_product_id": item.get("source_product_id"),
                "product_url": item.get("product_url"),
                "duplicate_key": item.get("duplicate_key"),
                "current_price": item.get("current_price"),
                "price_type": item.get("price_type"),
                "promotion_proven": item.get("promotion_proven"),
                "promotion_evidence": item.get("promotion_evidence"),
                "image_url": item.get("image_url"),
            }
            for index, item in enumerate(observations)
        ]
        return self._current_run_source_run_id

    def count(self, table: str, *, filters: dict[str, str] | None = None) -> int:
        filters = filters or {}
        if table == "retail_price_candidates":
            if filters.get("source_run_id"):
                expected = f"eq.{self._current_run_source_run_id}" if self._current_run_source_run_id else None
                return len(self._current_run_rows) if filters.get("source_run_id") == expected else 0
            if filters.get("retailer_slug") == "eq.leader-price-reunion":
                return len(self._current_run_rows)
            if filters.get("store_slug") == "eq.leaderprice-lp-ermitage":
                return len(self._current_run_rows)
            return len(self._current_run_rows)
        if table == "retail_price_observations":
            return 0
        if table == "market_products":
            return 123
        if table == "market_product_aliases":
            return 456
        if table == "market_manual_product_aliases":
            return 78
        return 0

    def select(self, table: str, *, filters: dict[str, str] | None = None, columns: str = "*") -> list[dict[str, object]]:
        filters = filters or {}
        if table == "shopping_promotions":
            return []
        if table == "retail_price_candidates":
            expected = f"eq.{self._current_run_source_run_id}" if self._current_run_source_run_id else None
            if filters.get("source_run_id") == expected:
                return list(self._current_run_rows)
        return []


class _SmokeStore:
    id = 8
    name = EXPECTED_STORE_NAME
    city = "Saint-Gilles Les Bains"
    postcode = "97434"
    slug = EXPECTED_STORE_SLUG
    url = "https://leaderdrive.re/leaderprice-lp-ermitage"


class _SmokeDeduplication:
    def __init__(self, *, total_input: int, unique_observations: int) -> None:
        self.total_input = total_input
        self.unique_observations = unique_observations
        self.duplicates = 0
        self.duplicate_same_page = 0
        self.duplicate_cross_page = 0


class _SmokeMatching:
    backend = "unavailable"
    matched = 0
    suggested = 0
    ambiguous = 0
    unmatched = MAX_LEADER_PRICE_PRODUCTS
