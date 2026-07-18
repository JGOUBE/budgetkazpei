from __future__ import annotations

import logging
import unittest

from receipt_scanner.api.logging_config import configure_logging
from receipt_scanner.api.settings import ScannerSettings
from receipt_scanner.service import ReceiptScanService


class ApiLoggingTest(unittest.TestCase):
    def test_production_logging_is_sanitized_and_limits_ocr_noise(self) -> None:
        settings = ScannerSettings(
            env="production",
            auth_mode="required",
            quota_mode="supabase",
            supabase_url="https://project-ref.supabase.co",
            supabase_anon_key="public-anon-key",
        )
        configure_logging(settings)

        self.assertGreaterEqual(logging.getLogger("RapidOCR").level, logging.WARNING)
        self.assertGreaterEqual(logging.getLogger("rapidocr").level, logging.WARNING)
        self.assertGreaterEqual(logging.getLogger("onnxruntime").level, logging.WARNING)

        with self.assertLogs("receipt_scanner.api", level="INFO") as captured:
            ReceiptScanService._log_success(
                "scan-safe-1",
                "single",
                {
                    "status": "trusted",
                    "should_record_budget": True,
                    "diagnostics": {"token_count": 42},
                    "receipt": {"product_line_count": 3},
                    "items": [{"raw_name": "DONNEE PERSONNELLE TEST"}],
                    "authorization": "Bearer secret-token",
                    "ocr_text": "OCR COMPLET INTERDIT",
                    "local_path": "C:\\Users\\Real\\ticket.jpg",
                },
                0.0,
            )

        logged = "\n".join(captured.output)
        self.assertIn("scan_completed", logged)
        self.assertNotIn("Bearer", logged)
        self.assertNotIn("Authorization", logged)
        self.assertNotIn("secret-token", logged)
        self.assertNotIn("OCR COMPLET", logged)
        self.assertNotIn("DONNEE PERSONNELLE TEST", logged)
        self.assertNotIn("C:\\Users", logged)


if __name__ == "__main__":
    unittest.main()
