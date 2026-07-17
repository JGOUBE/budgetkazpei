from __future__ import annotations

import json
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

from .column_detector import ColumnDetector
from .geometry_types import OCRBox, OCRDocument, OCRToken
from .image_preprocessor import ImagePreprocessor
from .line_reconstructor import LineReconstructor
from .long_receipt_pipeline import find_overlap
from .quality_gate import ReceiptQualityGate
from .receipt_parser_fr import ParsedReceipt, ParsedReceiptItem, ReceiptParserFR


def _token(index: int, text: str, x: float, y: float, score: float = 0.98) -> OCRToken:
    return OCRToken(
        index=index,
        text=text,
        score=score,
        box=OCRBox.from_raw(
            [
                [x, y],
                [x + max(40, len(text) * 9), y],
                [x + max(40, len(text) * 9), y + 24],
                [x, y + 24],
            ]
        ),
    )


def _build_synthetic_document() -> OCRDocument:
    tokens = [
        _token(0, "E.LECLERC", 70, 80),
        _token(1, "CASERNES", 70, 116),
        _token(2, "17/07/2026", 70, 152),
        _token(3, "14:52", 220, 152),
        _token(4, "DESIGNATION", 70, 220),
        _token(5, "PRIX", 620, 220),
        _token(6, "TVA", 730, 220),
        _token(7, "RIZ LOCAL 1KG", 70, 280),
        _token(8, "4.00", 620, 280),
        _token(9, "2", 730, 280),
        _token(10, "HARICOTS ROUGES", 70, 330),
        _token(11, "6.00", 620, 330),
        _token(12, "2", 730, 330),
        _token(13, "TOTAL 2 ARTICLES", 70, 430),
        _token(14, "TOTAL", 70, 480),
        _token(15, "10.00", 620, 480),
    ]
    return OCRDocument(
        source="synthetic-smoke",
        image_width=900,
        image_height=1200,
        elapsed_seconds=0.0,
        tokens=tokens,
        engine="synthetic",
    )


def _build_synthetic_receipt() -> ParsedReceipt:
    return ParsedReceipt(
        store_name="E.Leclerc",
        store_location="CASERNES",
        receipt_date="2026-07-17",
        receipt_time="14:52",
        declared_item_count=2,
        total=10.00,
        items=[
            ParsedReceiptItem(
                raw_name="RIZ LOCAL 1KG",
                quantity=1,
                unit_price=4.00,
                total_price=4.00,
                vat_code=2,
                item_type="standard",
                raw_detail=None,
                weight_kg=None,
                price_per_kg=None,
                ocr_confidence=0.98,
                source_line_ids=[1],
                needs_review=False,
            ),
            ParsedReceiptItem(
                raw_name="HARICOTS ROUGES",
                quantity=1,
                unit_price=6.00,
                total_price=6.00,
                vat_code=2,
                item_type="standard",
                raw_detail=None,
                weight_kg=None,
                price_per_kg=None,
                ocr_confidence=0.98,
                source_line_ids=[2],
                needs_review=False,
            ),
        ],
        excluded_sections=[],
        warnings=[],
    )


def _write_synthetic_image(path: Path) -> None:
    image = Image.new("RGB", (900, 1200), (226, 226, 218))
    draw = ImageDraw.Draw(image)
    for y in range(80, 520, 50):
        draw.rectangle((70, y, 780, y + 18), fill=(25, 25, 25))
    image.save(path, format="JPEG", quality=90)


def run_smoke_test() -> dict[str, object]:
    document = _build_synthetic_document()
    lines = LineReconstructor().reconstruct(document)
    layout = ColumnDetector().assign_columns(document, lines)
    parsed = ReceiptParserFR().parse(document, lines)
    synthetic_receipt = _build_synthetic_receipt()

    with tempfile.TemporaryDirectory(prefix="bkp-receipt-scanner-") as temp_dir:
        temp_path = Path(temp_dir)
        source_image = temp_path / "synthetic-receipt.jpg"
        preprocessed_image = temp_path / "synthetic-preprocessed.jpg"
        _write_synthetic_image(source_image)
        preprocessing = ImagePreprocessor(max_side=1000).process(
            source_image,
            preprocessed_image,
        )
        quality = ReceiptQualityGate().evaluate(
            preprocessed_image,
            document,
            synthetic_receipt,
        )

    if len(lines) < 4:
        raise RuntimeError("line reconstruction smoke test produced too few lines")
    if layout.price_anchor_x <= 0 or layout.vat_anchor_x <= 0:
        raise RuntimeError("column detection smoke test did not find anchors")
    if parsed.store_name != "E.Leclerc" or parsed.declared_item_count != 2:
        raise RuntimeError("parser smoke test did not detect the synthetic receipt metadata")
    if quality.status != "trusted":
        raise RuntimeError(f"quality gate smoke test expected trusted, got {quality.status}")
    if find_overlap is None:
        raise RuntimeError("long receipt overlap function is not importable")

    return {
        "ok": True,
        "line_count": len(lines),
        "layout_source": layout.source,
        "parsed_declared_item_count": parsed.declared_item_count,
        "quality_status": quality.status,
        "preprocessed_size": [preprocessing.output_width, preprocessing.output_height],
    }


def main() -> int:
    print(json.dumps(run_smoke_test(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
