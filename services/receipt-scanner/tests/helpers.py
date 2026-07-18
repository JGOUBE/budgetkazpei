from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from receipt_scanner.geometry_types import OCRBox, OCRDocument, OCRToken
from receipt_scanner.line_reconstructor import ReconstructedLine
from receipt_scanner.receipt_parser_fr import ParsedReceipt, ParsedReceiptItem


def make_box(x: float, y: float, width: float = 80, height: float = 22) -> OCRBox:
    return OCRBox.from_raw(
        [
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height],
        ]
    )


def make_token(
    index: int,
    text: str,
    x: float,
    y: float,
    *,
    column: str | None = None,
    score: float = 0.98,
    source_segment: str = "full",
) -> OCRToken:
    token = OCRToken(
        index=index,
        text=text,
        score=score,
        box=make_box(x, y, max(40, len(text) * 9), 24),
        column=column,
        source_segment=source_segment,
    )
    return token


def make_document(tokens: list[OCRToken], *, width: int = 900, height: int = 1400) -> OCRDocument:
    return OCRDocument(
        source="synthetic-test",
        image_width=width,
        image_height=height,
        elapsed_seconds=0.0,
        tokens=tokens,
        engine="synthetic",
    )


def make_line(line_id: int, parts: list[tuple[str, str, float]], *, y: float, segment: str = "full") -> ReconstructedLine:
    tokens = [
        make_token(
            index=(line_id * 10) + index,
            text=text,
            x=x,
            y=y,
            column=column,
            source_segment=segment,
        )
        for index, (text, column, x) in enumerate(parts)
    ]
    for token in tokens:
        token.line_id = line_id
    return ReconstructedLine(
        line_id=line_id,
        tokens=tokens,
        center_y=y + 12,
        y_min=y,
        y_max=y + 24,
    )


def standard_item(name: str, price: float, *, vat_code: int = 2, quantity: float = 1.0, needs_review: bool = False) -> ParsedReceiptItem:
    return ParsedReceiptItem(
        raw_name=name,
        quantity=quantity,
        unit_price=price if quantity == 1 else round(price / quantity, 2),
        total_price=price,
        vat_code=vat_code,
        item_type="standard",
        raw_detail=None,
        weight_kg=None,
        price_per_kg=None,
        ocr_confidence=0.98,
        source_line_ids=[],
        needs_review=needs_review,
    )


def parsed_receipt(
    *,
    total: float | None,
    items: list[ParsedReceiptItem],
    declared_item_count: int | None = None,
    warnings: list[str] | None = None,
    article_total: float | None = None,
    immediate_discount_total: float | None = None,
    payable_total: float | None = None,
) -> ParsedReceipt:
    return ParsedReceipt(
        store_name="E.Leclerc",
        store_location="CASERNES",
        receipt_date="2026-07-17",
        receipt_time="14:52",
        declared_item_count=declared_item_count,
        total=total,
        items=items,
        excluded_sections=[],
        warnings=warnings or [],
        article_total=article_total,
        immediate_discount_total=immediate_discount_total,
        payable_total=payable_total,
    )


def make_good_image(path: Path, *, width: int = 900, height: int = 1400) -> None:
    image = Image.new("RGB", (width, height), (232, 232, 224))
    draw = ImageDraw.Draw(image)
    for y in range(80, height - 80, 52):
        draw.rectangle((70, y, width - 110, y + 18), fill=(28, 28, 28))
    image.save(path, format="JPEG", quality=90)


def make_bad_image(path: Path) -> None:
    image = Image.new("RGB", (120, 120), (4, 4, 4))
    image.save(path, format="JPEG", quality=80)


class TempImageTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory(prefix="bkp-scanner-tests-")
        self.temp_path = Path(self._temp_dir.name)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()
