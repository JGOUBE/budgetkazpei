import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from helpers import make_line
from receipt_scanner.long_receipt_pipeline import (
    _repair_multibuy_detail_rows,
    _repair_staggered_financial_rows,
    find_overlap,
    run_long_receipt_pipeline,
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

    def test_three_segments_are_joined_sequentially_with_two_local_seams(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sources = [root / f"segment-{index}.jpg" for index in range(3)]
            for source in sources:
                source.write_bytes(b"image")

            def summary(name, anchors, similarity):
                merged = root / f"{name}-merged.jpg"
                merged.write_bytes(b"merged")
                summary_path = root / f"{name}-summary.json"
                return {
                    "run_id": name,
                    "overlap": {
                        "matched_anchor_count": anchors,
                        "average_similarity": similarity,
                        "bottom_cut_line": 3,
                    },
                    "preprocessing": {
                        "top": {"rotation_degrees": 0},
                        "bottom": {"rotation_degrees": 0},
                    },
                    "ocr": {
                        "elapsed_seconds_total": 0.2,
                        "merged_token_count": 30,
                    },
                    "files": {
                        "merged_preprocessed": str(merged),
                        "overlap_report": str(root / f"{name}-overlap.json"),
                        "summary": str(summary_path),
                    },
                }

            with patch(
                "receipt_scanner.long_receipt_pipeline.run_two_photo_pipeline",
                side_effect=[summary("pair-12", 3, 0.96), summary("pair-23", 4, 0.94)],
            ) as pair_pipeline:
                result = run_long_receipt_pipeline(
                    sources,
                    output_root=root,
                    run_id="three-segments",
                    ocr_engine=object(),
                )

            self.assertEqual(pair_pipeline.call_count, 2)
            second_call_paths = pair_pipeline.call_args_list[1].args
            self.assertTrue(str(second_call_paths[0]).endswith("pair-12-merged.jpg"))
            self.assertEqual(second_call_paths[1], sources[2])
            self.assertEqual(result["segment_count"], 3)
            self.assertEqual(
                [(pair["first_segment"], pair["second_segment"]) for pair in result["overlap"]["pairs"]],
                [(1, 2), (2, 3)],
            )
            self.assertEqual(result["overlap"]["matched_anchor_count"], 3)
            self.assertAlmostEqual(result["overlap"]["average_similarity"], 0.95)

    def test_three_segment_middle_without_overlap_is_never_silently_merged(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sources = [root / f"segment-{index}.jpg" for index in range(3)]
            for source in sources:
                source.write_bytes(b"image")
            with patch(
                "receipt_scanner.long_receipt_pipeline.run_two_photo_pipeline",
                side_effect=RuntimeError("Chevauchement insuffisant entre les photos"),
            ):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "long_receipt_overlap_unreliable",
                ):
                    run_long_receipt_pipeline(sources, output_root=root)

    def test_identical_product_away_from_the_seam_is_preserved(self) -> None:
        top = overlap_top_lines() + [
            make_line(5, [("BOUTEILLE IDENTIQUE", "description", 70), ("2.50", "price", 620)], y=240, segment="top"),
        ]
        bottom = overlap_bottom_lines()
        bottom.append(
            make_line(10, [("BOUTEILLE IDENTIQUE", "description", 70), ("2.50", "price", 620)], y=480, segment="bottom")
        )
        overlap = find_overlap(top, bottom)
        retained_text = [line.text for line in top + bottom[overlap.bottom_cut_line:]]
        self.assertEqual(
            sum("BOUTEILLE IDENTIQUE" in text for text in retained_text),
            2,
        )

    def test_promotion_inside_confirmed_seam_is_removed_once(self) -> None:
        top = overlap_top_lines()
        top.insert(
            4,
            make_line(4, [("PRIX PROMOTION -0.50", "description", 70)], y=180, segment="top"),
        )
        bottom = overlap_bottom_lines()
        bottom.insert(
            2,
            make_line(2, [("PRIX PROMOTION -0.50", "description", 70)], y=100, segment="bottom"),
        )
        overlap = find_overlap(top, bottom)
        retained_text = [line.text for line in top + bottom[overlap.bottom_cut_line:]]
        self.assertEqual(
            sum("PRIX PROMOTION" in text for text in retained_text),
            1,
        )


if __name__ == "__main__":
    unittest.main()
