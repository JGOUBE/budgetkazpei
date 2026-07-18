from __future__ import annotations

import io
import tempfile
import threading
import time
import unittest
from pathlib import Path

from PIL import Image

from receipt_scanner.api.errors import ScannerApiError
from receipt_scanner.api.settings import ScannerSettings
from receipt_scanner.receipt_parser_fr import ParsedReceipt
from receipt_scanner.service import PipelineResult, ReceiptScanService, ScanUpload

from helpers import standard_item


def image_bytes(
    *,
    width: int = 640,
    height: int = 900,
    image_format: str = "JPEG",
) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (235, 235, 230)).save(
        buffer,
        format=image_format,
    )
    return buffer.getvalue()


def upload(
    data: bytes | None = None,
    *,
    content_type: str = "image/jpeg",
) -> ScanUpload:
    return ScanUpload(
        filename="receipt.jpg",
        content_type=content_type,
        stream=io.BytesIO(data if data is not None else image_bytes()),
    )


def quality(
    status: str,
    *,
    budget_amount: float | None = None,
    unattributed_amount: float | None = None,
) -> dict[str, object]:
    return {
        "status": status,
        "exploitable": status != "scan_not_exploitable",
        "should_record_budget": status in {"trusted", "budget_ok_articles_partial"},
        "budget_amount": (
            budget_amount
            if budget_amount is not None
            else 74.24 if status == "budget_ok_articles_partial" else 48.58
        ),
        "article_data_mode": "partial" if status == "budget_ok_articles_partial" else "full",
        "should_feed_courses": status == "trusted",
        "should_feed_market_database": False,
        "should_feed_verified_articles": status == "trusted",
        "requires_user_validation": status != "trusted",
        "reasons": ["items_sum_differs_from_total"] if status == "budget_ok_articles_partial" else [],
        "unattributed_amount": unattributed_amount,
    }


def receipt(
    *,
    total: float = 48.58,
    item_total: float = 48.58,
    article_total: float | None = None,
    immediate_discount_total: float | None = None,
    payable_total: float | None = None,
) -> ParsedReceipt:
    return ParsedReceipt(
        store_name="E.Leclerc",
        store_location="CASERNES",
        receipt_date="2026-07-07",
        receipt_time="14:52",
        declared_item_count=1,
        total=total,
        items=[standard_item("RIZ LOCAL", item_total)],
        excluded_sections=[],
        warnings=[],
        article_total=article_total,
        immediate_discount_total=immediate_discount_total,
        payable_total=payable_total,
    )


class FakeRunner:
    model_loaded = False

    def __init__(
        self,
        *,
        result: PipelineResult | None = None,
        error: Exception | None = None,
        sleep_seconds: float = 0.0,
    ) -> None:
        self.result = result or PipelineResult(
            receipt=receipt(),
            quality=quality("trusted"),
            engine="synthetic",
            elapsed_seconds=0.125,
            token_count=14,
            rotation_degrees=0,
            overlap=None,
        )
        self.error = error
        self.sleep_seconds = sleep_seconds
        self.work_dirs: list[Path] = []

    def run_single(self, image_path: Path, work_dir: Path) -> PipelineResult:
        del image_path
        self.work_dirs.append(work_dir)
        if self.sleep_seconds:
            time.sleep(self.sleep_seconds)
        if self.error:
            raise self.error
        return self.result

    def run_long_receipt(
        self,
        top_image_path: Path,
        bottom_image_path: Path,
        work_dir: Path,
    ) -> PipelineResult:
        del top_image_path, bottom_image_path
        self.work_dirs.append(work_dir)
        return self.result


class ReceiptScanServiceTest(unittest.TestCase):
    def settings(self, **overrides) -> ScannerSettings:
        values = {
            "auth_mode": "disabled",
            "max_file_size_mb": 1,
            "max_total_file_size_mb": 2,
            "scanner_busy_timeout_seconds": 0.05,
            "processing_timeout_seconds": 2.0,
        }
        values.update(overrides)
        return ScannerSettings(**values)

    def service(self, runner: FakeRunner | None = None, **settings) -> ReceiptScanService:
        return ReceiptScanService(
            settings=self.settings(**settings),
            runner=runner or FakeRunner(),
        )

    def test_rejects_invalid_mime(self) -> None:
        with self.assertRaisesRegex(ScannerApiError, "invalid_file_type"):
            self.service().scan_single(
                upload=upload(content_type="application/pdf"),
                user_id="u1",
            )

    def test_rejects_file_too_large(self) -> None:
        svc = self.service(max_file_size_mb=1)
        with self.assertRaisesRegex(ScannerApiError, "file_too_large"):
            svc.scan_single(
                upload=upload(data=b"x" * (1024 * 1024 + 1)),
                user_id="u1",
            )

    def test_rejects_non_decodable_image(self) -> None:
        with self.assertRaisesRegex(ScannerApiError, "invalid_image"):
            self.service().scan_single(
                upload=upload(data=b"not an image"),
                user_id="u1",
            )

    def test_rejects_invalid_dimensions(self) -> None:
        with self.assertRaisesRegex(ScannerApiError, "image_dimensions_invalid"):
            self.service().scan_single(
                upload=upload(data=image_bytes(width=10, height=10)),
                user_id="u1",
            )

    def test_cleans_temp_dir_after_success(self) -> None:
        runner = FakeRunner()
        svc = self.service(runner)
        response = svc.scan_single(upload=upload(), user_id="u1")
        self.assertEqual(response["status"], "trusted")
        self.assertFalse(runner.work_dirs[0].exists())

    def test_cleans_temp_dir_after_error(self) -> None:
        runner = FakeRunner(error=RuntimeError("boom"))
        svc = self.service(runner)
        with self.assertRaises(ScannerApiError):
            svc.scan_single(upload=upload(), user_id="u1")
        self.assertFalse(runner.work_dirs[0].exists())

    def test_maps_budget_ok_articles_partial_and_rounds_unattributed(self) -> None:
        runner = FakeRunner(
            result=PipelineResult(
                receipt=receipt(
                    total=73.99,
                    item_total=74.04,
                    article_total=74.24,
                    immediate_discount_total=0.25,
                    payable_total=73.99,
                ),
                quality=quality(
                    "budget_ok_articles_partial",
                    budget_amount=73.99,
                    unattributed_amount=0.199999999,
                ),
                engine="synthetic",
                elapsed_seconds=18.4,
                token_count=144,
                rotation_degrees=0,
                overlap={"matched_anchor_count": 5, "average_similarity": 0.77914},
            )
        )
        response = self.service(runner).scan_single(upload=upload(), user_id="u1")
        self.assertEqual(response["status"], "budget_ok_articles_partial")
        self.assertEqual(response["budget_amount"], 73.99)
        self.assertEqual(response["receipt"]["items_total"], 74.04)
        self.assertEqual(response["receipt"]["total"], 73.99)
        self.assertEqual(response["receipt"]["article_total"], 74.24)
        self.assertEqual(response["receipt"]["immediate_discount_total"], 0.25)
        self.assertEqual(response["receipt"]["payable_total"], 73.99)
        self.assertEqual(response["unattributed_amount"], 0.2)
        self.assertFalse(response["items"][0]["eligible_for_courses"])

    def test_maps_needs_review_and_scan_not_exploitable(self) -> None:
        for status in ["needs_review", "scan_not_exploitable"]:
            with self.subTest(status=status):
                runner = FakeRunner(
                    result=PipelineResult(
                        receipt=receipt(),
                        quality=quality(status),
                        engine="synthetic",
                        elapsed_seconds=0.1,
                        token_count=0,
                        rotation_degrees=0,
                    )
                )
                response = self.service(runner).scan_single(upload=upload(), user_id="u1")
                self.assertEqual(response["status"], status)

    def test_scanner_busy_when_capacity_is_taken(self) -> None:
        svc = self.service()
        self.assertTrue(svc._semaphore.acquire(timeout=0.01))
        try:
            with self.assertRaisesRegex(ScannerApiError, "scanner_busy"):
                svc.scan_single(upload=upload(), user_id="u1")
        finally:
            svc._semaphore.release()

    def test_processing_timeout(self) -> None:
        runner = FakeRunner(sleep_seconds=0.3)
        with self.assertRaisesRegex(ScannerApiError, "processing_timeout"):
            self.service(runner, processing_timeout_seconds=0.05).scan_single(
                upload=upload(),
                user_id="u1",
            )

    def test_no_local_path_in_success_json(self) -> None:
        response = self.service().scan_single(upload=upload(), user_id="u1")
        payload = str(response)
        self.assertNotIn("bkp-receipt-scan", payload)
        self.assertNotIn("C:\\", payload)

    def test_long_receipt_uses_total_file_limit(self) -> None:
        svc = self.service(max_total_file_size_mb=1)
        padded_image = image_bytes() + (b"x" * 700_000)
        with self.assertRaisesRegex(ScannerApiError, "file_too_large"):
            svc.scan_long_receipt(
                top_upload=upload(data=padded_image),
                bottom_upload=upload(data=padded_image),
                user_id="u1",
            )


if __name__ == "__main__":
    unittest.main()
