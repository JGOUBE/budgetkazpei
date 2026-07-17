import json
import unittest

from helpers import make_document, make_token
from receipt_scanner.geometry_types import OCRBox, OCRDocument, OCRToken


class GeometryTypesTest(unittest.TestCase):
    def test_box_normalizes_coordinates(self) -> None:
        box = OCRBox.from_raw([[10, 5], [30, 5], [30, 25], [10, 25]])
        self.assertEqual(box.x_min, 10)
        self.assertEqual(box.x_max, 30)
        self.assertEqual(box.y_min, 5)
        self.assertEqual(box.y_max, 25)
        self.assertEqual(box.center_x, 20)
        self.assertEqual(box.center_y, 15)

    def test_document_round_trip(self) -> None:
        document = make_document([make_token(1, "TOTAL", 20, 40, column="description")])
        payload = json.loads(json.dumps(document.to_dict()))
        restored = OCRDocument.from_dict(payload)
        self.assertEqual(restored.source, document.source)
        self.assertEqual(restored.tokens[0].text, "TOTAL")
        self.assertEqual(restored.tokens[0].column, "description")

    def test_box_rejects_invalid_shape(self) -> None:
        with self.assertRaises(ValueError):
            OCRBox.from_raw([[0, 0], [1, 1], [2, 2]])


if __name__ == "__main__":
    unittest.main()
