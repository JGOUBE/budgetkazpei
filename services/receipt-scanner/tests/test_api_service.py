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
from receipt_scanner.quota import QuotaReservation, ScanQuotaProvider
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
        image_paths: list[Path],
        work_dir: Path,
    ) -> PipelineResult:
        self.long_segment_count = len(image_paths)
        self.work_dirs.append(work_dir)
        if self.error:
            raise self.error
        return self.result


class FakeQuotaProvider(ScanQuotaProvider):
    def __init__(
        self,
        *,
        allowed: bool = True,
        reason: str = "monthly_quota_reached",
    ) -> None:
        self.allowed = allowed
        self.reason = reason
        self.reserve_calls: list[dict[str, object]] = []
        self.complete_calls: list[QuotaReservation] = []
        self.release_calls: list[tuple[QuotaReservation, str]] = []

    def reserve_scan(
        self,
        *,
        user_id: str,
        mode: str,
        request_id: str,
        access_token: str | None,
    ) -> QuotaReservation:
        self.reserve_calls.append(
            {
                "user_id": user_id,
                "mode": mode,
                "request_id": request_id,
                "access_token": access_token,
            }
        )
        if not self.allowed:
            raise ScannerApiError(
                code=self.reason,
                retryable=True,
                scan_id=request_id,
            )
        return QuotaReservation(
            allowed=True,
            reservation_id=f"reservation:{request_id}",
            request_id=request_id,
            status="reserved",
        )

    def complete_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
    ) -> None:
        del access_token
        self.complete_calls.append(reservation)

    def release_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
        reason: str,
    ) -> None:
        del access_token
        self.release_calls.append((reservation, reason))


class FakeMarketResolver:
    def __init__(self, canonical_name: str = "Riz local long grain 1 kg") -> None:
        self.canonical_name = canonical_name
        self.calls: list[dict[str, object]] = []

    def enrich(
        self,
        receipt: ParsedReceipt,
        *,
        access_token: str | None,
    ) -> dict[str, object]:
        self.calls.append(
            {
                "access_token": access_token,
                "items": len(receipt.items),
            }
        )
        if receipt.items:
            receipt.items[0].canonical_name = self.canonical_name
        return {
            "requested": len(receipt.items),
            "resolved": 1 if receipt.items else 0,
            "skipped": False,
        }


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

    def service(
        self,
        runner: FakeRunner | None = None,
        quota_provider: ScanQuotaProvider | None = None,
        market_resolver: FakeMarketResolver | None = None,
        **settings,
    ) -> ReceiptScanService:
        return ReceiptScanService(
            settings=self.settings(**settings),
            runner=runner or FakeRunner(),
            quota_provider=quota_provider,
            market_resolver=market_resolver,
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
        self.assertEqual(
            response["diagnostics"]["parser"]["requested_mode"],
            "legacy",
        )
        self.assertEqual(
            response["diagnostics"]["parser"]["used_mode"],
            "legacy",
        )
        self.assertFalse(runner.work_dirs[0].exists())

    def test_reserves_and_completes_quota_after_valid_upload(self) -> None:
        quota = FakeQuotaProvider()
        response = self.service(quota_provider=quota).scan_single(
            upload=upload(),
            user_id="u1",
            access_token="user-token",
            scan_id="scan-123",
        )
        self.assertEqual(response["status"], "trusted")
        self.assertEqual(len(quota.reserve_calls), 1)
        self.assertEqual(quota.reserve_calls[0]["request_id"], "scan-123")
        self.assertEqual(quota.reserve_calls[0]["access_token"], "user-token")
        self.assertEqual(len(quota.complete_calls), 1)
        self.assertEqual(quota.release_calls, [])

    def test_market_resolver_keeps_access_token_and_canonical_name_in_api_response(self) -> None:
        resolver = FakeMarketResolver(
            canonical_name="Tarama aux oeufs de cabillaud 100 g"
        )
        response = self.service(market_resolver=resolver).scan_single(
            upload=upload(),
            user_id="u1",
            access_token="user-token",
            scan_id="scan-market-1",
        )
        self.assertEqual(resolver.calls[0]["access_token"], "user-token")
        self.assertEqual(
            response["items"][0]["canonical_name"],
            "Tarama aux oeufs de cabillaud 100 g",
        )

    def test_invalid_upload_does_not_reserve_quota(self) -> None:
        quota = FakeQuotaProvider()
        with self.assertRaisesRegex(ScannerApiError, "invalid_file_type"):
            self.service(quota_provider=quota).scan_single(
                upload=upload(content_type="application/pdf"),
                user_id="u1",
                access_token="user-token",
                scan_id="scan-123",
            )
        self.assertEqual(quota.reserve_calls, [])

    def test_monthly_quota_stops_before_pipeline(self) -> None:
        quota = FakeQuotaProvider(allowed=False)
        runner = FakeRunner()
        with self.assertRaisesRegex(ScannerApiError, "monthly_quota_reached"):
            self.service(runner=runner, quota_provider=quota).scan_single(
                upload=upload(),
                user_id="u1",
                access_token="user-token",
                scan_id="scan-123",
            )
        self.assertEqual(len(quota.reserve_calls), 1)
        self.assertEqual(runner.work_dirs, [])
        self.assertEqual(quota.complete_calls, [])

    def test_safety_limit_stops_before_pipeline(self) -> None:
        quota = FakeQuotaProvider(
            allowed=False,
            reason="scan_safety_limit_reached",
        )
        runner = FakeRunner()
        with self.assertRaisesRegex(ScannerApiError, "scan_safety_limit_reached"):
            self.service(runner=runner, quota_provider=quota).scan_single(
                upload=upload(),
                user_id="u1",
                access_token="user-token",
                scan_id="scan-123",
            )
        self.assertEqual(len(quota.reserve_calls), 1)
        self.assertEqual(runner.work_dirs, [])
        self.assertEqual(quota.complete_calls, [])

    def test_releases_reserved_quota_on_pipeline_failure(self) -> None:
        quota = FakeQuotaProvider()
        runner = FakeRunner(error=RuntimeError("boom"))
        with self.assertRaisesRegex(ScannerApiError, "internal_scan_error"):
            self.service(runner=runner, quota_provider=quota).scan_single(
                upload=upload(),
                user_id="u1",
                access_token="user-token",
                scan_id="scan-123",
            )
        self.assertEqual(len(quota.reserve_calls), 1)
        self.assertEqual(quota.complete_calls, [])
        self.assertEqual(len(quota.release_calls), 1)
        self.assertEqual(quota.release_calls[0][1], "internal_scan_error")

    def test_same_scan_id_is_idempotent_in_process(self) -> None:
        quota = FakeQuotaProvider()
        runner = FakeRunner()
        svc = self.service(runner=runner, quota_provider=quota)
        first = svc.scan_single(
            upload=upload(),
            user_id="u1",
            access_token="user-token",
            scan_id="scan-123",
        )
        second = svc.scan_single(
            upload=upload(),
            user_id="u1",
            access_token="user-token",
            scan_id="scan-123",
        )
        self.assertEqual(first, second)
        self.assertEqual(len(quota.reserve_calls), 1)
        self.assertEqual(len(quota.complete_calls), 1)
        self.assertEqual(len(runner.work_dirs), 1)

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

    def test_three_segment_long_receipt_reaches_generic_runner(self) -> None:
        runner = FakeRunner()
        response = self.service(runner).scan_long_receipt(
            segment_uploads=[upload(), upload(), upload()],
            user_id="u1",
        )
        self.assertEqual(response["mode"], "long_receipt")
        self.assertEqual(runner.long_segment_count, 3)

    def test_long_receipt_rejects_more_than_three_segments(self) -> None:
        with self.assertRaisesRegex(ScannerApiError, "invalid_file"):
            self.service().scan_long_receipt(
                segment_uploads=[upload(), upload(), upload(), upload()],
                user_id="u1",
            )

    def test_three_segment_unreliable_overlap_has_specific_error(self) -> None:
        runner = FakeRunner(
            error=RuntimeError(
                "long_receipt_overlap_unreliable: chevauchement adjacent insuffisant"
            )
        )
        with self.assertRaisesRegex(
            ScannerApiError,
            "long_receipt_overlap_unreliable",
        ):
            self.service(runner).scan_long_receipt(
                segment_uploads=[upload(), upload(), upload()],
                user_id="u1",
            )

    def test_unreadable_middle_segment_is_image_quality_error(self) -> None:
        runner = FakeRunner(
            error=RuntimeError(
                "Une des deux photos ne contient aucun texte lisible."
            )
        )
        with self.assertRaisesRegex(ScannerApiError, "image_quality_failed"):
            self.service(runner).scan_long_receipt(
                segment_uploads=[upload(), upload(), upload()],
                user_id="u1",
            )


if __name__ == "__main__":
    unittest.main()
