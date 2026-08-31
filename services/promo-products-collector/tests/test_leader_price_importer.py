from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from app.services.leader_price_importer import build_source_run_id, import_leader_price_report
from app.settings import Settings


class _FakeRpcClient:
    def __init__(self, result: dict[str, object]) -> None:
        self.result = result
        self.calls: list[tuple[str, dict[str, object]]] = []

    def rpc(self, function_name: str, payload: dict[str, object] | None = None) -> object:
        self.calls.append((function_name, payload or {}))
        return self.result


def _observation(
    source_product_id: str,
    *,
    price_type: str = "observed_price",
    promotion_proven: bool = False,
    promotion_evidence: str | None = None,
) -> dict[str, object]:
    return {
        "source_type": "leader_drive_html",
        "source_url": "https://leaderdrive.re/leaderprice-lp-ermitage/promotions",
        "source_product_id": source_product_id,
        "source_category_id": "PROMOTIONS",
        "source_observed_at": "2026-07-29T09:00:00Z",
        "retailer_slug": "leader-price-reunion",
        "retailer_name": "Leader Price Reunion",
        "store_slug": "leaderprice-lp-ermitage",
        "store_name": "LP Ermitage",
        "store_city": "Saint-Gilles Les Bains",
        "channel": "public_drive",
        "raw_product_name": f"Produit {source_product_id}",
        "product_name": f"Produit {source_product_id}",
        "normalized_product_name": f"produit {source_product_id.lower()}",
        "brand": "Leader",
        "package_format": "500 g",
        "quantity_value": 500,
        "quantity_unit": "g",
        "pack_count": 1,
        "total_quantity_value": 500,
        "total_quantity_unit": "g",
        "barcode": None,
        "category": "epicerie",
        "subcategory": "promotions",
        "image_url": "https://leaderdrive.re/image.png",
        "product_url": f"https://leaderdrive.re/articles/{source_product_id}",
        "current_price": 2.99,
        "original_price": 3.49 if price_type == "promotion" else None,
        "unit_price": 5.98,
        "unit_price_unit": "kg",
        "currency": "EUR",
        "price_type": price_type,
        "promotion_proven": promotion_proven,
        "promotion_evidence": promotion_evidence,
        "promo_badge": "Promo" if price_type == "promotion" else None,
        "discount_percent": 14.3 if price_type == "promotion" else None,
        "loyalty_amount": None,
        "loyalty_type": None,
        "offer_mechanism": "direct_discount" if price_type == "promotion" else None,
        "conditions": None,
        "starts_at": None,
        "ends_at": None,
        "matched_market_product_id": None,
        "matched_product_key": None,
        "match_method": None,
        "match_confidence": None,
        "match_warnings": [],
        "extraction_confidence": 95,
        "validation_errors": [],
        "availability_status": "available",
        "raw_evidence": {"source": "fixture"},
        "duplicate_key": f"leaderprice-lp-ermitage|{source_product_id}",
        "is_duplicate": False,
        "duplicate_of": None,
    }


class LeaderPriceImporterTests(unittest.TestCase):
    def test_build_source_run_id_is_order_insensitive(self):
        observations = [_observation("A1"), _observation("A2")]
        reversed_observations = list(reversed(observations))

        self.assertEqual(
            build_source_run_id(observations),
            build_source_run_id(reversed_observations),
        )

    def test_build_source_run_id_ignores_observation_timestamp_but_tracks_price(self):
        first = _observation("A1")
        later = dict(first, source_observed_at="2026-07-30T09:00:00Z")
        changed = dict(later, current_price=2.79)

        self.assertEqual(build_source_run_id([first]), build_source_run_id([later]))
        self.assertNotEqual(build_source_run_id([first]), build_source_run_id([changed]))

    def test_build_source_run_id_ignores_package_metadata(self):
        first = _observation("A1")
        changed_package = dict(
            first,
            package_format="20 cl",
            quantity_value=20,
            quantity_unit="cl",
            total_quantity_value=20,
            total_quantity_unit="cl",
        )
        self.assertEqual(
            build_source_run_id([first]),
            build_source_run_id([changed_package]),
        )

    def test_import_leader_price_report_calls_retail_rpc_with_limited_payload(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-leader-price-import-tests"
        temp_root.mkdir(parents=True, exist_ok=True)
        report_path = temp_root / "leader-price-reunion-readonly.json"
        report_path.write_text(
            json.dumps(
                {
                    "store": {
                        "slug": "leaderprice-lp-ermitage",
                        "name": "LP Ermitage",
                    },
                    "observations": [
                        _observation("A1"),
                        _observation(
                            "A2",
                            price_type="promotion",
                            promotion_proven=True,
                            promotion_evidence="badge_old_price",
                        ),
                        _observation("A3"),
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        settings = Settings.from_env().with_overrides(report_path=temp_root / "placeholder.json")
        client = _FakeRpcClient(
            {
                "source_run_id": "returned-run-id",
                "imported": 2,
                "updated": 0,
                "unchanged": 0,
                "duplicate": 0,
                "rejected": 0,
                "needs_review": 1,
            }
        )

        summary = import_leader_price_report(
            settings,
            report_path=report_path,
            max_products=2,
            client=client,
        )

        self.assertEqual(summary.source_run_id, "returned-run-id")
        self.assertEqual(summary.imported, 2)
        self.assertEqual(summary.needs_review, 1)
        self.assertEqual(summary.imported_items, 2)
        self.assertEqual(len(client.calls), 1)

        function_name, payload = client.calls[0]
        self.assertEqual(function_name, "retail_import_price_candidates")
        self.assertIn("p_source_run_id", payload)
        self.assertEqual(len(payload["p_items"]), 2)
        self.assertEqual(payload["p_items"][0]["store_city"], "Saint-Gilles Les Bains")
        self.assertEqual(
            payload["p_items"][1]["promotion_evidence"],
            {"kind": "badge_old_price"},
        )

    def test_import_rejects_unexpected_store(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-leader-price-import-tests-invalid"
        temp_root.mkdir(parents=True, exist_ok=True)
        report_path = temp_root / "leader-price-reunion-readonly.json"
        report_path.write_text(
            json.dumps(
                {
                    "store": {
                        "slug": "leaderprice-other-store",
                        "name": "Autre magasin",
                    },
                    "observations": [_observation("A1")],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        settings = Settings.from_env().with_overrides(report_path=temp_root / "placeholder.json")

        with self.assertRaisesRegex(ValueError, "unsupported_store_slug"):
            import_leader_price_report(
                settings,
                report_path=report_path,
                client=_FakeRpcClient({}),
            )


if __name__ == "__main__":
    unittest.main()
