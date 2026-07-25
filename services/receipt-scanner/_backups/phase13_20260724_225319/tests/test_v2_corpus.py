import csv
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from receipt_scanner.v2.corpus import (
    CorpusCase,
    _verdict,
    _match_int,
    _match_money,
    _match_text,
    load_manifest,
    parse_decimal,
    write_discovered_manifest,
)


class CorpusV2UtilitiesTest(unittest.TestCase):
    def test_money_comparison_is_cent_exact(self):
        self.assertTrue(
            _match_money(Decimal("17.95"), Decimal("17.95"))
        )
        self.assertFalse(
            _match_money(Decimal("17.95"), Decimal("17.94"))
        )

    def test_optional_expectations_do_not_fail_unknown_case(self):
        self.assertIsNone(_match_money(None, Decimal("17.95")))
        self.assertIsNone(_match_int(None, 9))
        self.assertIsNone(_match_text("", "Leader Price"))

    def test_manifest_supports_single_and_long_cases(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.csv"
            path.write_text(
                "case_id,enabled,mode,image_1,image_2\n"
                "simple,1,single,a.jpg,\n"
                "long,1,long,haut.jpg,bas.jpg\n",
                encoding="utf-8",
            )
            cases = load_manifest(path)
            self.assertEqual(len(cases), 2)
            self.assertEqual(cases[0].mode, "single")
            self.assertEqual(cases[1].mode, "long")
            self.assertEqual(cases[1].image_2, "bas.jpg")

    def test_discovered_manifest_keeps_absolute_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "ticket.jpg"
            image.write_bytes(b"fake")
            manifest = write_discovered_manifest(
                [image.resolve()],
                root / "manifest.csv",
            )
            cases = load_manifest(manifest)
            self.assertEqual(cases[0].image_1, str(image.resolve()))

    def test_parse_decimal_accepts_french_comma(self):
        self.assertEqual(parse_decimal("17,95 €"), Decimal("17.95"))


    def test_only_date_mismatch_can_pass_with_review(self):
        verdict, requires_review, reasons = _verdict(
            store_match=True,
            date_match=False,
            total_match=True,
            product_lines_match=True,
            quantity_match=True,
            expected_status="date_requires_review",
            error=None,
        )
        self.assertEqual(verdict, "PASS_WITH_REVIEW")
        self.assertTrue(requires_review)
        self.assertEqual(reasons, ["date_requires_review"])

    def test_missing_date_can_pass_with_review_when_core_is_valid(self):
        verdict, requires_review, reasons = _verdict(
            store_match=True,
            date_match=None,
            total_match=True,
            product_lines_match=True,
            quantity_match=True,
            expected_status="date_requires_review",
            error=None,
        )
        self.assertEqual(verdict, "PASS_WITH_REVIEW")
        self.assertTrue(requires_review)
        self.assertEqual(reasons, ["date_requires_review"])

    def test_date_review_never_hides_a_total_failure(self):
        verdict, requires_review, reasons = _verdict(
            store_match=True,
            date_match=False,
            total_match=False,
            product_lines_match=True,
            quantity_match=True,
            expected_status="date_requires_review",
            error=None,
        )
        self.assertEqual(verdict, "FAIL")
        self.assertFalse(requires_review)
        self.assertEqual(reasons, [])



if __name__ == "__main__":
    unittest.main()
