from __future__ import annotations

import logging

from .settings import ScannerSettings


NOISY_OCR_LOGGERS = (
    "RapidOCR",
    "rapidocr",
    "onnxruntime",
)


def configure_logging(settings: ScannerSettings) -> None:
    scanner_level = _resolve_level(settings.log_level, logging.INFO)
    ocr_level = _resolve_level(settings.ocr_log_level, logging.WARNING)

    logging.getLogger("receipt_scanner").setLevel(scanner_level)
    logging.getLogger("receipt_scanner.api").setLevel(scanner_level)

    for logger_name in NOISY_OCR_LOGGERS:
        logging.getLogger(logger_name).setLevel(ocr_level)


def _resolve_level(value: str, default: int) -> int:
    resolved = getattr(logging, str(value or "").upper(), None)
    return resolved if isinstance(resolved, int) else default
