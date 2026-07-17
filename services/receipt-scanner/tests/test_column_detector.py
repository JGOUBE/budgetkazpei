import unittest

from helpers import make_document, make_line, make_token
from receipt_scanner.column_detector import ColumnDetector
from receipt_scanner.line_reconstructor import LineReconstructor


class ColumnDetectorTest(unittest.TestCase):
    def test_detects_price_and_vat_from_header(self) -> None:
        tokens = [
            make_token(1, "DESIGNATION", 70, 80),
            make_token(2, "TTC", 620, 80),
            make_token(3, "TVA", 730, 80),
            make_token(4, "RIZ", 70, 130),
            make_token(5, "4.00", 620, 130),
            make_token(6, "2", 730, 130),
        ]
        document = make_document(tokens)
        lines = LineReconstructor().reconstruct(document)
        layout = ColumnDetector().assign_columns(document, lines)
        self.assertEqual(layout.source, "header")
        self.assertEqual(tokens[4].column, "price")
        self.assertEqual(tokens[5].column, "vat")

    def test_uses_ratio_fallback_when_header_is_missing(self) -> None:
        document = make_document([make_token(1, "RIZ", 70, 80), make_token(2, "4.00", 620, 80)])
        lines = LineReconstructor().reconstruct(document)
        layout = ColumnDetector().assign_columns(document, lines)
        self.assertEqual(layout.source, "ratio_fallback")

    def test_vat_code_is_not_quantity_column(self) -> None:
        token = make_token(1, "2", 730, 100)
        layout = ColumnDetector()._build_layout(
            price_anchor=620,
            vat_anchor=730,
            source="test",
            header_line_id=None,
        )
        self.assertEqual(ColumnDetector().classify_token(token, layout), "vat")


if __name__ == "__main__":
    unittest.main()
