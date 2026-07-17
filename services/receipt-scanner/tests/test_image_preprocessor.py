import unittest

from PIL import Image

from helpers import TempImageTestCase
from receipt_scanner.image_preprocessor import ImagePreprocessor


class ImagePreprocessorTest(TempImageTestCase):
    def test_horizontal_receipt_is_rotated_90_degrees(self) -> None:
        source = self.temp_path / "horizontal.jpg"
        output = self.temp_path / "preprocessed.jpg"
        Image.new("RGB", (1600, 800), (240, 240, 235)).save(source, format="JPEG")
        result = ImagePreprocessor(max_side=1200).process(source, output)
        self.assertEqual(result.rotation_degrees, 90)
        self.assertGreater(result.output_height, result.output_width)
        self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
