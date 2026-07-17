import unittest

from helpers import make_document, make_token
from receipt_scanner.line_reconstructor import LineReconstructor


class LineReconstructorTest(unittest.TestCase):
    def test_groups_tokens_by_physical_row_and_orders_by_x(self) -> None:
        tokens = [
            make_token(2, "4.00", 620, 100),
            make_token(1, "RIZ LOCAL", 70, 101),
            make_token(3, "TOTAL", 70, 170),
        ]
        lines = LineReconstructor().reconstruct(make_document(tokens))
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0].text, "RIZ LOCAL | 4.00")
        self.assertEqual(lines[1].text, "TOTAL")
        self.assertEqual(tokens[0].line_id, 0)

    def test_empty_ocr_document_returns_no_lines(self) -> None:
        self.assertEqual(LineReconstructor().reconstruct(make_document([])), [])


if __name__ == "__main__":
    unittest.main()
