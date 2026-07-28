from __future__ import annotations

import importlib
import tempfile
import unittest
from pathlib import Path

from app.extractors.catalog_product_ocr import _cli_analyze_image


class RuntimeDependencyTests(unittest.TestCase):
    def test_runtime_critical_modules_are_importable(self):
        modules = [
            "PIL.Image",
            "rapidocr",
            "onnxruntime",
            "app.settings",
            "app.services.vision_benchmark",
        ]
        for module_name in modules:
            with self.subTest(module=module_name):
                self.assertIsNotNone(importlib.import_module(module_name))

    def test_cli_analyze_image_runs_minimal_ocr(self):
        image_module = importlib.import_module("PIL.Image")
        image_draw_module = importlib.import_module("PIL.ImageDraw")

        runtime_root = Path(tempfile.gettempdir()) / "budgetkazpei-promo-runtime-tests"
        runtime_root.mkdir(parents=True, exist_ok=True)
        image_path = runtime_root / "ocr-smoke.png"

        image = image_module.new("RGB", (320, 120), "white")
        draw = image_draw_module.Draw(image)
        draw.text((12, 20), "PROMO 2,99 EUR", fill="black")
        image.save(image_path)

        page = _cli_analyze_image(image_path, page_number=11)

        self.assertEqual(page.image_width, 320)
        self.assertEqual(page.image_height, 120)
        self.assertEqual(page.engine, "rapidocr-onnxruntime")
        self.assertGreaterEqual(len(page.lines), 1)
        self.assertTrue(any(line.text.strip() for line in page.lines))

        image_path.unlink(missing_ok=True)
        runtime_root.rmdir()


if __name__ == "__main__":
    unittest.main()
