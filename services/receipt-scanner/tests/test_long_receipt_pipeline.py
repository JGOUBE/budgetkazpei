import unittest

from helpers import make_line
from receipt_scanner.long_receipt_pipeline import (
    _repair_multibuy_detail_rows,
    _repair_staggered_financial_rows,
    find_overlap,
    run_two_photo_pipeline,
)


def overlap_top_lines():
    return [
        make_line(0, [("RIZ LOCAL", "description", 70), ("4.00", "price", 620)], y=40, segment="top"),
        make_line(1, [("HUILE TOURNESOL", "description", 70), ("3.20", "price", 620)], y=80, segment="top"),
        make_line(2, [("COFFRET COMPAS 3 PIECES", "description", 70), ("1.50", "price", 620)], y=120, segment="top"),
        make_line(3, [("BLOC DESSIN BLANC A4", "description", 70), ("3.25", "price", 620)], y=160, segment="top"),
        make_line(4, [("FROMAGE FONDU ECO 200G", "description", 70), ("2.10", "price", 620)], y=200, segment="top"),
    ]


def overlap_bottom_lines():
    lines = [
        make_line(0, [("COFFRET COMPAS 3 PIECES", "description", 70), ("1.50", "price", 620)], y=40, segment="bottom"),
        make_line(1, [("BLOC DESSIN BLANC A4", "description", 70), ("3.25", "price", 620)], y=80, segment="bottom"),
        make_line(2, [("FROMAGE FONDU ECO 200G", "description", 70), ("2.10", "price", 620)], y=120, segment="bottom"),
        make_line(3, [("NOUVEAU PRODUIT BAS", "description", 70), ("5.00", "price", 620)], y=160, segment="bottom"),
    ]
    for index in range(4, 10):
        lines.append(
            make_line(
                index,
                [(f"PRODUIT BAS {index}", "description", 70), (f"{index}.00", "price", 620)],
                y=160 + (index - 3) * 40,
                segment="bottom",
            )
        )
    return lines


class LongReceiptPipelineTest(unittest.TestCase):
    def test_valid_overlap_requires_ordered_text_anchors(self) -> None:
        overlap = find_overlap(overlap_top_lines(), overlap_bottom_lines())
        self.assertEqual(overlap.matched_anchor_count, 3)
        self.assertEqual(overlap.bottom_cut_line, 3)
        self.assertGreater(overlap.average_similarity, 0.9)

    def test_price_only_lines_are_not_valid_overlap_anchors(self) -> None:
        top = [make_line(index, [(f"{index + 1}.00", "price", 620)], y=40 + index * 40, segment="top") for index in range(5)]
        bottom = [make_line(index, [(f"{index + 1}.00", "price", 620)], y=40 + index * 40, segment="bottom") for index in range(5)]
        with self.assertRaisesRegex(RuntimeError, "Chevauchement insuffisant"):
            find_overlap(top, bottom)

    def test_insufficient_overlap_is_refused(self) -> None:
        top = overlap_top_lines()
        bottom = [make_line(0, [("UN SEUL PRODUIT COMMUN", "description", 70)], y=40, segment="bottom")]
        with self.assertRaisesRegex(RuntimeError, "Pas assez|Chevauchement insuffisant"):
            find_overlap(top, bottom)

    def test_reversed_photos_do_not_create_a_false_trusted_merge(self) -> None:
        with self.assertRaises(RuntimeError):
            find_overlap(overlap_bottom_lines(), overlap_top_lines())

    def test_missing_photo_fails_before_ocr(self) -> None:
        with self.assertRaises(FileNotFoundError):
            run_two_photo_pipeline("missing-top.jpg", "missing-bottom.jpg")

    def test_repairs_staggered_description_and_price_rows(self) -> None:
        lines = [
            make_line(0, [("RIZ LOCAL", "description", 70)], y=100, segment="top"),
            make_line(1, [("4.00", "price", 620), ("2", "vat", 730)], y=124, segment="top"),
        ]
        repaired, report = _repair_staggered_financial_rows(lines)
        self.assertEqual(len(repaired), 1)
        self.assertEqual(report[0]["mode"], "description_before_price")
        self.assertIn("RIZ LOCAL", repaired[0].text)
        self.assertIn("4.00", repaired[0].text)

    def test_does_not_join_section_header_with_price_row(self) -> None:
        lines = [
            make_line(0, [(">> EPICERIE", "description", 70)], y=100, segment="top"),
            make_line(1, [("4.00", "price", 620), ("2", "vat", 730)], y=124, segment="top"),
        ]
        repaired, report = _repair_staggered_financial_rows(lines)
        self.assertEqual(len(repaired), 2)
        self.assertEqual(report, [])

    def test_repairs_multibuy_unit_price_from_proven_total_only(self) -> None:
        lines = [
            make_line(0, [("BARRES CHOCO", "description", 70)], y=100, segment="top"),
            make_line(1, [("2 X 3.BC€", "detail", 70), ("7.60", "price", 620), ("2", "vat", 730)], y=140, segment="top"),
        ]
        repaired, report = _repair_multibuy_detail_rows(lines)
        self.assertEqual(report[0]["quantity"], 2)
        self.assertEqual(report[0]["unit_price"], 3.80)
        self.assertEqual(report[0]["total_price"], 7.60)
        self.assertIn("3.80", repaired[1].text)

    def test_no_multibuy_repair_when_arithmetic_is_not_cent_exact(self) -> None:
        lines = [
            make_line(0, [("BARRES CHOCO", "description", 70)], y=100, segment="top"),
            make_line(1, [("3 X 2.BC€", "detail", 70), ("7.61", "price", 620), ("2", "vat", 730)], y=140, segment="top"),
        ]
        _repaired, report = _repair_multibuy_detail_rows(lines)
        self.assertEqual(report, [])


if __name__ == "__main__":
    unittest.main()
