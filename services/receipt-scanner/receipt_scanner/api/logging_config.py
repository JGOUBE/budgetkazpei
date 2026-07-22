from __future__ import annotations

import json
import logging
import sys

from .settings import ScannerSettings


NOISY_OCR_LOGGERS = (
    "RapidOCR",
    "rapidocr",
    "onnxruntime",
)

_HANDLER_NAME = "receipt_scanner_cloud_run"

_SAFE_EXTRA_FIELDS = (
    "scan_id",
    "mode",
    "status",
    "duration_seconds",
    "token_count",
    "product_line_count",
    "should_record_budget",
    "requested_count",
    "resolved_count",
    "reason",
)


class _CloudRunJsonFormatter(logging.Formatter):
    """Emit one safe JSON object per line for Cloud Run."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }

        for field in _SAFE_EXTRA_FIELDS:
            if hasattr(record, field):
                payload[field] = getattr(record, field)

        return json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            default=str,
        )


def configure_logging(settings: ScannerSettings) -> None:
    scanner_level = _resolve_level(settings.log_level, logging.INFO)
    ocr_level = _resolve_level(settings.ocr_log_level, logging.WARNING)

    scanner_logger = logging.getLogger("receipt_scanner")
    scanner_logger.setLevel(scanner_level)
    scanner_logger.propagate = False

    handler = next(
        (
            current
            for current in scanner_logger.handlers
            if current.get_name() == _HANDLER_NAME
        ),
        None,
    )

    if handler is None:
        handler = logging.StreamHandler(sys.stdout)
        handler.set_name(_HANDLER_NAME)
        handler.setFormatter(_CloudRunJsonFormatter())
        scanner_logger.addHandler(handler)

    handler.setLevel(scanner_level)

    api_logger = logging.getLogger("receipt_scanner.api")
    api_logger.setLevel(scanner_level)
    api_logger.propagate = True

    for logger_name in NOISY_OCR_LOGGERS:
        logging.getLogger(logger_name).setLevel(ocr_level)


def _resolve_level(value: str, default: int) -> int:
    resolved = getattr(logging, str(value or "").upper(), None)
    return resolved if isinstance(resolved, int) else default
