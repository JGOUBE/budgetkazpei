from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    import receipt_scanner
    from receipt_scanner.column_detector import ColumnDetector
    from receipt_scanner.geometry_types import OCRDocument
    from receipt_scanner.image_preprocessor import ImagePreprocessor
    from receipt_scanner.line_reconstructor import LineReconstructor
    from receipt_scanner.quality_gate import ReceiptQualityGate
    from receipt_scanner.receipt_parser_fr import ReceiptParserFR

    payload = {
        "ok": True,
        "package_version": receipt_scanner.__version__,
        "imports": [
            OCRDocument.__name__,
            ImagePreprocessor.__name__,
            LineReconstructor.__name__,
            ColumnDetector.__name__,
            ReceiptParserFR.__name__,
            ReceiptQualityGate.__name__,
        ],
        "ocr_engine_initialized": False,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
