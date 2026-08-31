from __future__ import annotations

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from app.collectors.leader_price_reunion import LeaderPriceReadonlyRunReport
from app.models.retail_price_observation import RetailPriceObservation
from app.services.leader_price_importer import build_source_run_id
from app.services.leader_price_incremental import (
    build_incremental_source_run_id,
    plan_incremental_observations,
    run_leader_price_incremental,
)
from app.settings import Settings


class _Store:
    id = 8
    name = "LP Ermitage"
    city = "Saint-Gilles Les Bains"
    postcode = "97434"
    slug = "leaderprice-lp-ermitage"
    url = "https://leaderdrive.re/leaderprice-lp-ermitage"


class _Dedupe:
    def __init__(self, total: int) -> None:
        self.total_input = total
        self.unique_observations = total
        self.duplicates = 0


class _Matching:
    backend = "offline"
    matched = 0
    suggested = 0
    ambiguous = 0
    unmatched = 0


class _Client:
    def __init__(self, existing: list[dict[str, object]] | None = None) -> None:
        self.existing = existing or []
        self.rpc_calls: list[tuple[str, dict[str, object]]] = []

    def select(self, table: str, *, filters=None, columns="*") -> list[dict[str, object]]:
        self.asserted_table = table
        return list(self.existing)

    def rpc(self, function_name: str, payload: dict[str, object] | None = None) -> object:
        body = payload or {}
        self.rpc_calls.append((function_name, body))
        return {
            "source_run_id": body.get("p_source_run_id"),
            "imported": len(body.get("p_items", [])),
            "updated": 0,
            "unchanged": 0,
            "duplicate": 0,
            "rejected": 0,
            "needs_review": 0,
        }


def _observation(
    source_product_id: str,
    *,
    name: str = "Produit test",
    current_price: float | None = 1.89,
    original_price: float | None = None,
    promotion: bool = False,
    package_format: str = "500 g",
    observed_at: str = "2026-08-27T08:00:00Z",
) -> RetailPriceObservation:
    return RetailPriceObservation(
        source_type="leader_drive_html",
        source_url="https://leaderdrive.re/leaderprice-lp-ermitage/promotions",
        source_product_id=source_product_id,
        source_category_id="PROMOTIONS",
        source_observed_at=observed_at,
        retailer_slug="leader-price-reunion",
        retailer_name="Leader Price Réunion",
        store_slug="leaderprice-lp-ermitage",
        store_name="LP Ermitage",
        channel="public_drive",
        raw_product_name=name,
        product_name=name,
        normalized_product_name=name.lower(),
        brand="Leader",
        package_format=package_format,
        quantity_value=500,
        quantity_unit="g",
        pack_count=None,
        total_quantity_value=500,
        total_quantity_unit="g",
        barcode=None,
        category="ÉPICERIE",
        subcategory="PROMOTIONS" if promotion else "ÉPICERIE SALÉE",
        image_url=None,
        product_url=f"https://leaderdrive.re/leaderprice-lp-ermitage/articles/test/{source_product_id}",
        current_price=current_price,
        original_price=original_price,
        unit_price=None,
        unit_price_unit=None,
        currency="EUR",
        price_type="promotion" if promotion else "observed_price",
        promotion_proven=promotion,
        promotion_evidence="old_price_and_new_price" if promotion else None,
        promo_badge="Prix Promo" if promotion else None,
        discount_percent=None,
        loyalty_amount=None,
        loyalty_type=None,
        offer_mechanism="direct_discount" if promotion else None,
        conditions=None,
        starts_at=None,
        ends_at=None,
        extraction_confidence=95,
        validation_errors=[] if current_price is not None else ["missing_current_price"],
        availability_status="available",
        raw_evidence={},
        duplicate_key=f"leaderprice-lp-ermitage|source-id:{source_product_id.lower()}",
    )


def _existing(observation: RetailPriceObservation) -> dict[str, object]:
    row = observation.to_dict()
    row.update(
        {
            "id": f"candidate-{observation.source_product_id}",
            "source_run_id": build_source_run_id([observation.to_dict()]),
            "created_at": observation.source_observed_at,
            "updated_at": observation.source_observed_at,
        }
    )
    return row


def _report(observations: list[RetailPriceObservation], root: Path | None = None) -> LeaderPriceReadonlyRunReport:
    target_root = root or Path(tempfile.gettempdir()) / "budgetkazpei-incremental-tests"
    return LeaderPriceReadonlyRunReport(
        store=_Store(),
        visited_urls=[],
        audited_categories=[],
        page_audits=[],
        observations=observations,
        deduplication=_Dedupe(len(observations)),
        matching=_Matching(),
        human_audit=[],
        report_path=str(target_root / "leader-price-reunion-readonly.json"),
        summary_path=str(target_root / "leader-price-reunion-readonly-summary.md"),
        request_count=0,
        duration_seconds=0,
        classification="A",
        external_cost_eur=0,
        errors=[],
    )


def _plan(
    observations: list[RetailPriceObservation],
    existing: list[dict[str, object]] | None = None,
):
    return plan_incremental_observations(_report(observations), existing or [])


class LeaderPriceIncrementalTests(unittest.TestCase):
    def test_first_unknown_product_creates_candidate(self):
        candidates, unchanged, actions, errors = _plan([_observation("A1")])
        self.assertEqual((len(candidates), len(unchanged), len(errors)), (1, 0, 0))
        self.assertEqual(actions[0].change_type, "new_product")

    def test_identical_second_pass_creates_no_candidate(self):
        first = _observation("A1")
        second = _observation("A1", observed_at="2026-08-27T10:00:00Z")
        candidates, unchanged, actions, _ = _plan([second], [_existing(first)])
        self.assertEqual((len(candidates), len(unchanged)), (0, 1))
        self.assertEqual(actions[0].change_type, "unchanged")

    def test_package_format_change_is_metadata_only(self):
        first = _observation("A1", package_format="25 cl")
        second = _observation(
            "A1",
            package_format="20 cl",
            observed_at="2026-08-27T10:00:00Z",
        )
        candidates, unchanged, actions, _ = _plan([second], [_existing(first)])
        self.assertEqual((len(candidates), len(unchanged)), (0, 1))
        self.assertEqual(actions[0].change_type, "unchanged")

    def test_price_change_creates_candidate(self):
        candidates, _, actions, _ = _plan(
            [_observation("A1", current_price=1.79)],
            [_existing(_observation("A1", current_price=1.89))],
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(actions[0].change_type, "price_change")

    def test_old_price_and_explicit_proof_detect_new_promotion(self):
        candidates, _, actions, _ = _plan(
            [_observation("A1", current_price=1.79, original_price=1.99, promotion=True)],
            [_existing(_observation("A1", current_price=1.79))],
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(actions[0].change_type, "new_promotion")

    def test_promotion_disappearance_detects_return_to_normal(self):
        candidates, _, actions, _ = _plan(
            [_observation("A1", current_price=1.99)],
            [_existing(_observation("A1", current_price=1.79, original_price=1.99, promotion=True))],
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(actions[0].change_type, "return_to_normal")

    def test_return_to_historical_normal_state_gets_new_transition_run(self):
        historical_normal = _observation("A1", current_price=1.99, observed_at="2026-08-25T08:00:00Z")
        promotion = _observation(
            "A1",
            current_price=1.79,
            original_price=1.99,
            promotion=True,
            observed_at="2026-08-26T08:00:00Z",
        )
        current_normal = _observation("A1", current_price=1.99, observed_at="2026-08-27T08:00:00Z")
        candidates, _, actions, _ = _plan(
            [current_normal],
            [_existing(historical_normal), _existing(promotion)],
        )
        self.assertEqual(actions[0].change_type, "return_to_normal")
        self.assertNotEqual(
            build_incremental_source_run_id(candidates),
            _existing(historical_normal)["source_run_id"],
        )

    def test_name_change_with_same_source_id_is_same_source_product(self):
        candidates, unchanged, _, _ = _plan(
            [_observation("A1", name="Produit test nouveau libellé")],
            [_existing(_observation("A1", name="Produit test"))],
        )
        self.assertEqual((len(candidates), len(unchanged)), (0, 1))

    def test_close_names_with_different_source_ids_do_not_merge(self):
        candidates, unchanged, _, _ = _plan(
            [_observation("A1", name="Lait demi écrémé"), _observation("A2", name="Lait demi-ecreme")]
        )
        self.assertEqual((len(candidates), len(unchanged)), (2, 0))

    def test_identical_rerun_has_complete_idempotence(self):
        first = _observation("A1")
        rerun = _observation("A1", observed_at="2026-08-28T08:00:00Z")
        self.assertEqual(
            build_source_run_id([first.to_dict()]),
            build_source_run_id([rerun.to_dict()]),
        )
        candidates, unchanged, _, _ = _plan([rerun], [_existing(first)])
        self.assertEqual((len(candidates), len(unchanged)), (0, 1))

    def test_product_without_price_is_not_candidate(self):
        candidates, unchanged, actions, errors = _plan([_observation("A1", current_price=None)])
        self.assertEqual((len(candidates), len(unchanged)), (0, 0))
        self.assertEqual(actions[0].change_type, "unusable_without_price")
        self.assertTrue(errors)

    def test_real_mode_only_calls_staging_import_rpc(self):
        root = Path(tempfile.gettempdir()) / "budgetkazpei-incremental-real-test"
        root.mkdir(parents=True, exist_ok=True)
        settings = replace(Settings.from_env(), report_path=root / "placeholder.json")
        client = _Client()
        readonly = _report([_observation("A1")], root)

        with patch(
            "app.services.leader_price_incremental.run_leader_price_readonly",
            return_value=readonly,
        ):
            report = run_leader_price_incremental(
                settings,
                fetcher=object(),
                dry_run=False,
                client=client,
            )

        self.assertEqual(report.metrics.candidates_created, 1)
        self.assertEqual([name for name, _ in client.rpc_calls], ["retail_import_price_candidates"])
        self.assertFalse(report.to_dict()["writes"]["shopping_promotions"])
        self.assertFalse(report.to_dict()["writes"]["retail_price_observations"])
        self.assertFalse(report.to_dict()["writes"]["market_price_observations"])

    def test_dry_run_performs_no_rpc_write(self):
        root = Path(tempfile.gettempdir()) / "budgetkazpei-incremental-dry-test"
        root.mkdir(parents=True, exist_ok=True)
        settings = replace(Settings.from_env(), report_path=root / "placeholder.json")
        client = _Client()
        with patch(
            "app.services.leader_price_incremental.run_leader_price_readonly",
            return_value=_report([_observation("A1")], root),
        ):
            report = run_leader_price_incremental(
                settings,
                fetcher=object(),
                dry_run=True,
                client=client,
            )
        self.assertEqual(report.metrics.candidates_to_create, 1)
        self.assertEqual(client.rpc_calls, [])
        self.assertTrue(report.to_dict()["dry_run"])
        self.assertFalse(report.to_dict()["writes"]["retail_price_candidates"])


if __name__ == "__main__":
    unittest.main()
