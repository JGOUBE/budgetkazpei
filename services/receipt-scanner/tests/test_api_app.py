from __future__ import annotations

import importlib
import sys
import unittest

from fastapi.testclient import TestClient

from receipt_scanner.api.app import create_app
from receipt_scanner.api.settings import ScannerSettings

from test_api_service import image_bytes, quality, receipt


def scan_response(mode: str = "single") -> dict[str, object]:
    return {
        "scan_id": "scan-test",
        "mode": mode,
        "status": "trusted",
        "exploitable": True,
        "should_record_budget": True,
        "budget_amount": 48.58,
        "article_data_mode": "full",
        "should_feed_courses": True,
        "should_feed_market_database": False,
        "should_feed_verified_articles": True,
        "requires_user_validation": False,
        "unattributed_amount": None,
        "receipt": {
            "store_name": "E.Leclerc",
            "store_location": "CASERNES",
            "receipt_date": "2026-07-07",
            "receipt_time": "14:52",
            "declared_item_count": 1,
            "counted_quantity": 1,
            "product_line_count": 1,
            "items_total": 48.58,
            "total": 48.58,
        },
        "items": [
            {
                "raw_name": "RIZ LOCAL",
                "canonical_name": None,
                "quantity": 1,
                "unit_price": 48.58,
                "total_price": 48.58,
                "weight_kg": None,
                "price_per_kg": None,
                "vat_code": 2,
                "item_type": "standard",
                "ocr_confidence": 0.98,
                "needs_review": False,
                "eligible_for_courses": True,
                "eligible_for_market_database": False,
            }
        ],
        "warnings": [],
        "reasons": [],
        "diagnostics": {
            "engine": "synthetic",
            "elapsed_seconds": 0.1,
            "token_count": 12,
            "rotation_degrees": 0,
            "overlap": {"used": mode == "long_receipt"},
            "parser": {
                "requested_mode": "shadow",
                "used_mode": "legacy",
                "production_output_changed": False,
                "fallback_reasons": [],
                "v2_reasons": [],
            },
        },
    }


class FakeApiService:
    model_loaded = False

    def scan_single(self, **_kwargs):
        return scan_response("single")

    def scan_long_receipt(self, **_kwargs):
        return scan_response("long_receipt")


class ExplodingApiService(FakeApiService):
    def scan_single(self, **_kwargs):
        raise ValueError("secret stack details")


class ApiAppTest(unittest.TestCase):
    def client(self, service=None) -> TestClient:
        app = create_app(
            settings=ScannerSettings(auth_mode="disabled"),
            scan_service=service or FakeApiService(),
        )
        return TestClient(app, raise_server_exceptions=False)

    def test_health_and_ready(self) -> None:
        client = self.client()
        self.assertEqual(client.get("/health").json()["status"], "ok")
        ready = client.get("/ready").json()
        self.assertTrue(ready["ready"])
        self.assertEqual(ready["auth_mode"], "disabled")
        self.assertEqual(ready["quota_mode"], "supabase")
        self.assertEqual(ready["parser_mode"], "shadow")

    def test_scan_single_endpoint(self) -> None:
        response = self.client().post(
            "/scan/single",
            files={"image": ("receipt.jpg", image_bytes(), "image/jpeg")},
            data={"scan_id": "scan-test"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "single")

    def test_scan_long_receipt_endpoint(self) -> None:
        response = self.client().post(
            "/scan/long-receipt",
            files={
                "top_image": ("top.jpg", image_bytes(), "image/jpeg"),
                "bottom_image": ("bottom.jpg", image_bytes(), "image/jpeg"),
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "long_receipt")

    def test_scan_long_receipt_three_segments_endpoint(self) -> None:
        response = self.client().post(
            "/scan/long-receipt",
            files=[
                ("segments", ("top.jpg", image_bytes(), "image/jpeg")),
                ("segments", ("middle.jpg", image_bytes(), "image/jpeg")),
                ("segments", ("bottom.jpg", image_bytes(), "image/jpeg")),
            ],
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "long_receipt")

    def test_scan_long_receipt_rejects_four_segments(self) -> None:
        response = self.client().post(
            "/scan/long-receipt",
            files=[
                ("segments", (f"segment-{index}.jpg", image_bytes(), "image/jpeg"))
                for index in range(4)
            ],
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_file")

    def test_unhandled_errors_do_not_return_stack_traces(self) -> None:
        response = self.client(ExplodingApiService()).post(
            "/scan/single",
            files={"image": ("receipt.jpg", image_bytes(), "image/jpeg")},
        )
        self.assertEqual(response.status_code, 500)
        body = response.json()
        self.assertEqual(body["error"]["code"], "internal_scan_error")
        self.assertNotIn("secret stack details", str(body))

    def test_api_import_does_not_initialize_ocr(self) -> None:
        sys.modules.pop("receipt_scanner.ocr_engine", None)
        importlib.import_module("receipt_scanner.api.app")
        self.assertNotIn("receipt_scanner.ocr_engine", sys.modules)


if __name__ == "__main__":
    unittest.main()
