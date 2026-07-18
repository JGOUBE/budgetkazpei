from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from receipt_scanner.column_detector import ColumnDetector
from receipt_scanner.image_preprocessor import ImagePreprocessor
from receipt_scanner.line_reconstructor import LineReconstructor
from receipt_scanner.long_receipt_pipeline import run_two_photo_pipeline
from receipt_scanner.quality_gate import ReceiptQualityGate
from receipt_scanner.receipt_parser_fr import ReceiptParserFR


def _skip(message: str) -> int:
    print(json.dumps({"status": "skipped", "reason": message}, ensure_ascii=False, indent=2))
    return 0


def _assert_close(name: str, actual: float | int | None, expected: float | int, tolerance: float = 0.02) -> None:
    if actual is None or abs(float(actual) - float(expected)) > tolerance:
        raise AssertionError(f"{name}: expected {expected}, got {actual}")


def _run_single_fixture(image_path: Path, output_root: Path, run_id: str) -> dict[str, object]:
    from receipt_scanner.ocr_engine import RapidOCREngine

    run_dir = output_root / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    preprocessed_path = run_dir / "preprocessed.jpg"
    preprocessing = ImagePreprocessor(max_side=1600).process(image_path, preprocessed_path)

    document = RapidOCREngine(use_cls=False).analyze(preprocessed_path)
    lines = LineReconstructor().reconstruct(document)
    if document.tokens:
        ColumnDetector().assign_columns(document, lines)
    receipt = ReceiptParserFR().parse(document, lines)
    decision = ReceiptQualityGate().evaluate(preprocessed_path, document, receipt)

    return {
        "preprocessing": preprocessing.to_dict(),
        "receipt": receipt.to_dict(),
        "quality": decision.to_dict(),
    }


def main() -> int:
    root_value = os.environ.get("RECEIPT_SCANNER_PRIVATE_FIXTURES_DIR", "").strip()
    if not root_value:
        return _skip("RECEIPT_SCANNER_PRIVATE_FIXTURES_DIR is not set")

    root = Path(root_value).expanduser().resolve()
    if not root.is_dir():
        return _skip("private fixtures directory does not exist")

    required = {
        "short": root / "input" / "ticket_test.jpg",
        "horizontal": root / "input" / "ticket_02.jpg",
        "bad": root / "input" / "ticket_test_degrade.jpg",
        "incomplete": root / "input" / "ticket_test_total_masque.jpg",
        "long_top": root / "input" / "ticket_long_top.jpg",
        "long_bottom": root / "input" / "ticket_long_bottom.jpg",
    }
    missing = [name for name, path in required.items() if not path.is_file()]
    if missing:
        return _skip(f"private fixture files missing: {', '.join(missing)}")

    with tempfile.TemporaryDirectory(prefix="bkp-private-scanner-") as temp_dir:
        output_root = Path(temp_dir)

        short = _run_single_fixture(required["short"], output_root, "private-short")
        if short["quality"]["status"] != "trusted":
            raise AssertionError(f"short fixture expected trusted, got {short['quality']['status']}")
        _assert_close("short total", short["receipt"]["total"], 48.58)
        _assert_close("short items_total", short["receipt"]["items_total"], 48.58)
        _assert_close("short counted_quantity", short["receipt"]["counted_quantity"], 21, tolerance=0.001)
        if short["receipt"]["product_line_count"] != 20:
            raise AssertionError(f"short product_line_count expected 20, got {short['receipt']['product_line_count']}")

        horizontal = _run_single_fixture(required["horizontal"], output_root, "private-horizontal")
        if horizontal["preprocessing"]["rotation_degrees"] != 90:
            raise AssertionError("horizontal fixture expected automatic 90 degree rotation")
        if horizontal["quality"]["status"] != "trusted":
            raise AssertionError(f"horizontal fixture expected trusted, got {horizontal['quality']['status']}")
        _assert_close("horizontal total", horizontal["receipt"]["total"], 89.81)
        _assert_close("horizontal items_total", horizontal["receipt"]["items_total"], 89.81)
        _assert_close("horizontal counted_quantity", horizontal["receipt"]["counted_quantity"], 32, tolerance=0.001)
        if horizontal["receipt"]["product_line_count"] != 31:
            raise AssertionError(f"horizontal product_line_count expected 31, got {horizontal['receipt']['product_line_count']}")

        bad = _run_single_fixture(required["bad"], output_root, "private-bad")
        if bad["quality"]["status"] != "scan_not_exploitable":
            raise AssertionError(f"bad image expected scan_not_exploitable, got {bad['quality']['status']}")

        incomplete = _run_single_fixture(required["incomplete"], output_root, "private-incomplete")
        if incomplete["quality"]["status"] != "needs_review":
            raise AssertionError(f"incomplete expected needs_review, got {incomplete['quality']['status']}")

        long = run_two_photo_pipeline(
            required["long_top"],
            required["long_bottom"],
            output_root=output_root,
            run_id="private-long",
        )
        if long["quality"]["status"] != "budget_ok_articles_partial":
            raise AssertionError(f"long receipt expected budget_ok_articles_partial, got {long['quality']['status']}")
        if long["receipt"]["store_name"] != "E.Leclerc":
            raise AssertionError(f"long store expected E.Leclerc, got {long['receipt']['store_name']}")
        if long["receipt"]["store_location"] != "CASERNES":
            raise AssertionError(f"long location expected CASERNES, got {long['receipt']['store_location']}")
        if long["receipt"]["receipt_date"] != "2026-07-07":
            raise AssertionError(f"long date expected 2026-07-07, got {long['receipt']['receipt_date']}")
        _assert_close("long items_total", long["receipt"]["items_total"], 74.04)
        _assert_close("long total", long["receipt"]["total"], 73.99)
        _assert_close("long article_total", long["receipt"]["article_total"], 74.24)
        _assert_close("long immediate_discount_total", long["receipt"]["immediate_discount_total"], 0.25)
        _assert_close("long payable_total", long["receipt"]["payable_total"], 73.99)
        _assert_close("long budget_amount", long["quality"]["budget_amount"], 73.99)
        _assert_close("long unattributed_amount", long["quality"]["unattributed_amount"], 0.20)
        if long["receipt"]["product_line_count"] != 32:
            raise AssertionError(f"long product_line_count expected 32, got {long['receipt']['product_line_count']}")
        _assert_close("long counted_quantity", long["receipt"]["counted_quantity"], 33, tolerance=0.001)

    print(json.dumps({"status": "passed"}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
