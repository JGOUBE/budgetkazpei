from pathlib import Path
import unittest

from app.extractors.catalog_page_regions import detect_regions
from app.extractors.catalog_product_ocr import OcrLine, OcrPage
from app.models.promotion_candidate import BoundingBox


def _line(line_id: int, text: str, left: float, top: float, width: float = 180, height: float = 28) -> OcrLine:
    return OcrLine(
        id=line_id,
        text=text,
        score=0.95,
        bounding_box=BoundingBox(left=left, top=top, width=width, height=height),
        fragments=[text],
    )


class CatalogPageRegionsTests(unittest.TestCase):
    def test_detects_offer_regions_across_two_columns(self):
        page = OcrPage(
            source="synthetic",
            page_number=1,
            image_width=1200,
            image_height=1800,
            elapsed_seconds=0.1,
            engine="synthetic",
            lines=[
                _line(0, "PATES 500 g", 60, 80),
                _line(1, "1,29", 80, 122, width=90),
                _line(2, "RIZ LONG 1 kg", 60, 300),
                _line(3, "2,49", 80, 342, width=90),
                _line(4, "JUS ORANGE 1 l", 710, 88),
                _line(5, "1,89", 730, 130, width=90),
            ],
        )

        regions = detect_regions(page)

        self.assertEqual(len(regions), 3)
        self.assertEqual([region.page_number for region in regions], [1, 1, 1])
        self.assertTrue(all("p001-r" in region.region_id for region in regions))
        self.assertEqual(sorted(region.column_index for region in regions), [0, 0, 1])

    def test_keeps_adjacent_prices_in_separate_regions(self):
        page = OcrPage(
            source="synthetic",
            page_number=2,
            image_width=1200,
            image_height=1600,
            elapsed_seconds=0.1,
            engine="synthetic",
            lines=[
                _line(0, "YAOURT 4x125 g", 70, 120),
                _line(1, "1,99", 90, 168, width=90),
                _line(2, "COMPOTE 12x90 g", 360, 120),
                _line(3, "2,49", 380, 168, width=90),
                _line(4, "0,99 / kg", 90, 208, width=110),
            ],
        )

        regions = detect_regions(page, layout_type="product_grid")

        self.assertEqual(len(regions), 2)
        self.assertTrue(all(region.price_anchor_count == 1 for region in regions))

    def test_ignores_legal_layouts(self):
        page = OcrPage(
            source="synthetic",
            page_number=3,
            image_width=1200,
            image_height=1600,
            elapsed_seconds=0.1,
            engine="synthetic",
            lines=[
                _line(0, "Voir conditions en magasin", 60, 100, width=480),
                _line(1, "Ticket E.Leclerc", 60, 140, width=320),
            ],
        )

        regions = detect_regions(page, layout_type="legal_or_conditions")

        self.assertEqual(regions, [])


if __name__ == "__main__":
    unittest.main()
