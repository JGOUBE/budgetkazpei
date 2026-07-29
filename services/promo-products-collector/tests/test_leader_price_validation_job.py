from __future__ import annotations

import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from app.collectors.leader_price_reunion import LeaderPriceReadonlyRunReport
from app.models.retail_price_observation import RetailPriceObservation
from app.services.leader_price_importer import LeaderPriceImportSummary, build_source_run_id
from app.services.leader_price_validation_job import (
    EXPECTED_RETAILER_SLUG,
    EXPECTED_STORE_NAME,
    EXPECTED_STORE_SLUG,
    MAX_LEADER_PRICE_PRODUCTS,
    build_validation_job_smoke_report,
    run_leader_price_validation_job,
)
from app.settings import Settings


class _FakeStore:
    id = 8
    name = EXPECTED_STORE_NAME
    city = "Saint-Gilles Les Bains"
    postcode = "97434"
    slug = EXPECTED_STORE_SLUG
    url = "https://leaderdrive.re/leaderprice-lp-ermitage"


class _FakeDeduplication:
    def __init__(self, total_input: int, unique_observations: int, duplicates: int = 0) -> None:
        self.total_input = total_input
        self.unique_observations = unique_observations
        self.duplicates = duplicates
        self.duplicate_same_page = 0
        self.duplicate_cross_page = 0


class _FakeMatching:
    backend = "offline"
    matched = 0
    suggested = 0
    ambiguous = 0
    unmatched = MAX_LEADER_PRICE_PRODUCTS


class _FakeFetcher:
    def fetch_text(self, url: str, *, allowed_hosts: set[str], settings: Settings):
        raise AssertionError(f"unexpected_fetch:{url}")


class _FakeAdminClient:
    def __init__(self) -> None:
        self.current_source_run_id: str | None = None
        self.current_rows: list[dict[str, object]] = []
        self.market_products_total = 123
        self.market_product_aliases_total = 456
        self.market_manual_product_aliases_total = 78
        self.shopping_promotions_rows: list[dict[str, object]] = []

    def count(self, table: str, *, filters: dict[str, str] | None = None) -> int:
        filters = filters or {}
        if table == "retail_price_candidates":
            if filters.get("source_run_id"):
                expected = f"eq.{self.current_source_run_id}" if self.current_source_run_id else None
                return len(self.current_rows) if filters.get("source_run_id") == expected else 0
            if filters.get("retailer_slug") == f"eq.{EXPECTED_RETAILER_SLUG}":
                return len(self.current_rows)
            if filters.get("store_slug") == f"eq.{EXPECTED_STORE_SLUG}":
                return len(self.current_rows)
            return len(self.current_rows)
        if table == "retail_price_observations":
            return 0
        if table == "market_products":
            return self.market_products_total
        if table == "market_product_aliases":
            return self.market_product_aliases_total
        if table == "market_manual_product_aliases":
            return self.market_manual_product_aliases_total
        return 0

    def select(self, table: str, *, filters: dict[str, str] | None = None, columns: str = "*") -> list[dict[str, object]]:
        filters = filters or {}
        if table == "shopping_promotions":
            return list(self.shopping_promotions_rows)
        if table == "retail_price_candidates":
            expected = f"eq.{self.current_source_run_id}" if self.current_source_run_id else None
            if filters.get("source_run_id") == expected:
                return list(self.current_rows)
        return []

    def record_import(self, observations: list[dict[str, object]]) -> str:
        self.current_source_run_id = build_source_run_id(observations)
        self.current_rows = [
            {
                "id": f"row-{index}",
                "retailer_slug": item["retailer_slug"],
                "store_slug": item["store_slug"],
                "store_name": item["store_name"],
                "source_product_id": item["source_product_id"],
                "product_url": item["product_url"],
                "duplicate_key": item["duplicate_key"],
                "current_price": item["current_price"],
                "price_type": item["price_type"],
                "promotion_proven": item["promotion_proven"],
                "promotion_evidence": item["promotion_evidence"],
                "image_url": item["image_url"],
            }
            for index, item in enumerate(observations)
        ]
        return self.current_source_run_id


def _observation(index: int, *, price_type: str = "observed_price", current_price: float = 2.99) -> RetailPriceObservation:
    is_promotion = price_type == "promotion"
    return RetailPriceObservation(
        source_type="leader_drive_html",
        source_url="https://leaderdrive.re/leaderprice-lp-ermitage/promotions",
        source_product_id=f"TEST-{index:03d}",
        source_category_id="PROMOTIONS",
        source_observed_at=f"2026-07-29T10:{index % 60:02d}:00Z",
        retailer_slug=EXPECTED_RETAILER_SLUG,
        retailer_name="Leader Price Reunion",
        store_slug=EXPECTED_STORE_SLUG,
        store_name=EXPECTED_STORE_NAME,
        channel="public_drive",
        raw_product_name=f"Produit test {index}",
        product_name=f"Produit test {index}",
        normalized_product_name=f"produit test {index}",
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
        image_url=f"https://leaderdrive.re/images/test-{index}.png",
        product_url=f"https://leaderdrive.re/articles/test-{index}",
        current_price=current_price,
        original_price=3.49 if is_promotion else None,
        unit_price=5.98,
        unit_price_unit="kg",
        currency="EUR",
        price_type=price_type,
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
        raw_evidence={"source": "fixture"},
        duplicate_key=f"{EXPECTED_STORE_SLUG}|TEST-{index:03d}",
    )


def _readonly_report(temp_root: Path, observations: list[RetailPriceObservation]) -> LeaderPriceReadonlyRunReport:
    report_path = temp_root / "leader-price-reunion-readonly.json"
    summary_path = temp_root / "leader-price-reunion-readonly-summary.md"
    report_path.write_text(
        json.dumps(
            {
                "store": {
                    "slug": EXPECTED_STORE_SLUG,
                    "name": EXPECTED_STORE_NAME,
                    "city": "Saint-Gilles Les Bains",
                },
                "observations": [item.to_dict() for item in observations],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    summary_path.write_text("ok\n", encoding="utf-8")
    return LeaderPriceReadonlyRunReport(
        store=_FakeStore(),
        visited_urls=["https://leaderdrive.re/leaderprice-lp-ermitage/promotions"],
        audited_categories=[],
        page_audits=[],
        observations=observations,
        deduplication=_FakeDeduplication(total_input=len(observations), unique_observations=len(observations)),
        matching=_FakeMatching(),
        human_audit=[],
        report_path=str(report_path),
        summary_path=str(summary_path),
        request_count=4,
        duration_seconds=0.2,
        classification="A",
        external_cost_eur=0.0,
        errors=[],
    )


class LeaderPriceValidationJobTests(unittest.TestCase):
    def test_smoke_report_is_stateful_and_secret_free(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-leader-price-validation-smoke"
        settings = replace(
            Settings.from_env(),
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="super-secret-token",
            report_path=temp_root / "report.json",
            temp_dir=temp_root / "tmp",
        )

        report = build_validation_job_smoke_report(settings)
        payload = json.dumps(report.to_dict(), ensure_ascii=False)

        self.assertEqual(report.readonly_metrics["unique_products"], 100)
        self.assertEqual(report.readonly_metrics["observed_prices"], 80)
        self.assertEqual(report.readonly_metrics["promotions_proven"], 20)
        self.assertEqual(report.first_import.imported, 100)
        self.assertEqual(report.post_import.retail_price_candidates_current_run, 100)
        self.assertEqual(report.post_import.retail_price_candidates_current_run_observed_price, 80)
        self.assertEqual(report.post_import.retail_price_candidates_current_run_promotion, 20)
        self.assertEqual(report.temporary_files_remaining, 0)
        self.assertIn("leader-price-import-validation-report.json", report.report_path)
        self.assertNotIn("super-secret-token", payload)
        self.assertNotIn("https://example.supabase.co", payload)

    def test_validation_job_calls_single_import_and_cleans_temp_files(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-leader-price-validation-offline"
        settings = replace(
            Settings.from_env(),
            report_path=temp_root / "placeholder.json",
            temp_dir=temp_root / "tmp",
        )
        admin_client = _FakeAdminClient()
        import_calls: list[dict[str, object]] = []
        observations = [_observation(index, price_type="promotion" if index < 20 else "observed_price") for index in range(100)]

        def readonly_runner(current_settings: Settings, *, fetcher, max_products: int) -> LeaderPriceReadonlyRunReport:
            current_settings.temp_dir.mkdir(parents=True, exist_ok=True)
            (current_settings.temp_dir / "ephemeral.tmp").write_text("delete-me", encoding="utf-8")
            return _readonly_report(temp_root, observations[:max_products])

        def import_runner(current_settings: Settings, *, report_path: Path | None = None, max_products: int = 100, client=None):
            import_calls.append({"report_path": str(report_path), "max_products": max_products})
            payload = json.loads(Path(report_path).read_text(encoding="utf-8"))
            selected = list(payload["observations"])[:max_products]
            source_run_id = admin_client.record_import(selected)
            return LeaderPriceImportSummary(
                source_run_id=source_run_id,
                retailer_slug=EXPECTED_RETAILER_SLUG,
                store_slug=EXPECTED_STORE_SLUG,
                imported=len(selected),
                updated=0,
                unchanged=0,
                duplicate=0,
                rejected=0,
                needs_review=0,
                imported_items=len(selected),
                report_path=str(report_path),
            )

        report = run_leader_price_validation_job(
            settings,
            fetcher=_FakeFetcher(),
            admin_client=admin_client,
            readonly_runner=readonly_runner,
            import_runner=import_runner,
        )

        self.assertEqual(len(import_calls), 1)
        self.assertEqual(report.baseline.retail_price_candidates_current_run, 0)
        self.assertEqual(report.first_import.imported_items, 100)
        self.assertEqual(report.post_import.retail_price_candidates_current_run, 100)
        self.assertFalse(settings.temp_dir.exists())
        self.assertEqual(report.temporary_files_remaining, 0)

    def test_validation_job_rejects_invalid_price(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-leader-price-validation-invalid-price"
        settings = replace(Settings.from_env(), report_path=temp_root / "placeholder.json", temp_dir=temp_root / "tmp")
        observations = [_observation(0, current_price=0.0)]

        def readonly_runner(current_settings: Settings, *, fetcher, max_products: int) -> LeaderPriceReadonlyRunReport:
            return _readonly_report(temp_root, observations)

        with self.assertRaisesRegex(RuntimeError, "leader_price_validation_job_invalid_current_price"):
            run_leader_price_validation_job(
                settings,
                fetcher=_FakeFetcher(),
                admin_client=_FakeAdminClient(),
                readonly_runner=readonly_runner,
                import_runner=lambda *args, **kwargs: LeaderPriceImportSummary(
                    source_run_id="unused",
                    retailer_slug=EXPECTED_RETAILER_SLUG,
                    store_slug=EXPECTED_STORE_SLUG,
                    imported=0,
                    updated=0,
                    unchanged=0,
                    duplicate=0,
                    rejected=0,
                    needs_review=0,
                    imported_items=0,
                    report_path="unused",
                ),
            )

    def test_validation_job_rejects_promotion_without_proof(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-leader-price-validation-invalid-promo"
        settings = replace(Settings.from_env(), report_path=temp_root / "placeholder.json", temp_dir=temp_root / "tmp")
        invalid_promotion = replace(
            _observation(0, price_type="promotion"),
            promotion_proven=False,
            promotion_evidence=None,
        )

        def readonly_runner(current_settings: Settings, *, fetcher, max_products: int) -> LeaderPriceReadonlyRunReport:
            return _readonly_report(temp_root, [invalid_promotion])

        with self.assertRaisesRegex(RuntimeError, "leader_price_validation_job_promotion_without_proof"):
            run_leader_price_validation_job(
                settings,
                fetcher=_FakeFetcher(),
                admin_client=_FakeAdminClient(),
                readonly_runner=readonly_runner,
                import_runner=lambda *args, **kwargs: LeaderPriceImportSummary(
                    source_run_id="unused",
                    retailer_slug=EXPECTED_RETAILER_SLUG,
                    store_slug=EXPECTED_STORE_SLUG,
                    imported=0,
                    updated=0,
                    unchanged=0,
                    duplicate=0,
                    rejected=0,
                    needs_review=0,
                    imported_items=0,
                    report_path="unused",
                ),
            )


if __name__ == "__main__":
    unittest.main()
