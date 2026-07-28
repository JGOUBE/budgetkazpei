import unittest

from app.extractors.catalog_product_ocr import OcrLine, OcrPage
from app.models.promotion_candidate import BoundingBox
from app.services.page_layout_classifier import classify_page_layout, select_representative_pages


def _line(line_id: int, text: str, left: float, top: float, width: float = 180, height: float = 28) -> OcrLine:
    return OcrLine(
        id=line_id,
        text=text,
        score=0.95,
        bounding_box=BoundingBox(left=left, top=top, width=width, height=height),
        fragments=[text],
    )


class PageLayoutClassifierTests(unittest.TestCase):
    def test_classifies_cover_without_prices(self):
        page = OcrPage(
            source="synthetic",
            page_number=1,
            image_width=1200,
            image_height=1800,
            elapsed_seconds=0.1,
            engine="synthetic",
            lines=[
                _line(0, "RENTREE DES CLASSES", 160, 160, width=480, height=52),
                _line(1, "Mention tres bien", 220, 260, width=320, height=44),
            ],
        )

        analysis = classify_page_layout(page)

        self.assertEqual(analysis.layout_type, "cover")
        self.assertFalse(analysis.recommended_for_mvp)

    def test_classifies_dense_list(self):
        lines = []
        for index in range(12):
            top = 80 + (index * 52)
            lines.append(_line(index * 2, f"FOURNITURE {index} 12x90 g", 60, top, width=340))
            lines.append(_line(index * 2 + 1, f"{index % 4 + 1},9{index % 10}", 440, top + 8, width=92))
        page = OcrPage(
            source="synthetic",
            page_number=2,
            image_width=1200,
            image_height=1800,
            elapsed_seconds=0.1,
            engine="synthetic",
            lines=lines,
        )

        analysis = classify_page_layout(page)

        self.assertEqual(analysis.layout_type, "dense_list")
        self.assertFalse(analysis.recommended_for_mvp)

    def test_classifies_product_grid(self):
        page = OcrPage(
            source="synthetic",
            page_number=3,
            image_width=1200,
            image_height=1800,
            elapsed_seconds=0.1,
            engine="synthetic",
            lines=[
                _line(0, "PATES 500 g", 60, 120),
                _line(1, "1,29", 90, 168, width=90),
                _line(2, "RIZ 1 kg", 60, 420),
                _line(3, "2,39", 90, 468, width=90),
                _line(4, "JUS ORANGE 1 l", 700, 120),
                _line(5, "1,89", 730, 168, width=90),
                _line(6, "BISCUITS 250 g", 700, 420),
                _line(7, "2,59", 730, 468, width=90),
            ],
        )

        analysis = classify_page_layout(page)

        self.assertEqual(analysis.layout_type, "product_grid")
        self.assertTrue(analysis.recommended_for_mvp)

    def test_selects_representative_pages(self):
        dense_lines = []
        for index in range(10):
            top = 80 + (index * 48)
            dense_lines.append(_line(index * 2, f"FOURNITURE {index}", 60, top, width=320))
            dense_lines.append(_line(index * 2 + 1, f"1,{index}9", 420, top + 6, width=90))

        page_inputs = {
            4: [_line(0, "PATES 500 g", 60, 120), _line(1, "1,29", 90, 168, width=90), _line(2, "JUS 1 l", 700, 120), _line(3, "1,89", 730, 168, width=90)],
            5: [_line(0, "RIZ 1 kg", 60, 120), _line(1, "2,39", 90, 168, width=90), _line(2, "CAFE 250 g", 700, 120), _line(3, "3,49", 730, 168, width=90)],
            6: [_line(0, "PACK EAU 6x1,5 l", 160, 180), _line(1, "3,99", 200, 236, width=110)],
            7: [_line(0, "LESSIVE 2 l", 160, 180), _line(1, "4,99", 200, 236, width=110)],
            8: dense_lines,
        }
        analyses = [
            classify_page_layout(
                OcrPage(
                    source="synthetic",
                    page_number=page_number,
                    image_width=1200,
                    image_height=1800,
                    elapsed_seconds=0.1,
                    engine="synthetic",
                    lines=lines,
                )
            )
            for page_number, lines in page_inputs.items()
        ]

        selected = select_representative_pages(analyses)

        self.assertGreaterEqual(len(selected), 4)
        self.assertLessEqual(len(selected), 5)


if __name__ == "__main__":
    unittest.main()
