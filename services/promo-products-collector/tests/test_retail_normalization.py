from __future__ import annotations

import unittest

from app.services.retail_product_normalization import (
    build_duplicate_key,
    normalize_lookup_key,
    parse_package_format,
    parse_unit_price,
)


class RetailNormalizationTests(unittest.TestCase):
    def test_parses_simple_package(self):
        package = parse_package_format("150 g")
        self.assertEqual(package.quantity_value, 150.0)
        self.assertEqual(package.quantity_unit, "g")
        self.assertEqual(package.total_quantity_value, 150.0)

    def test_parses_multipack_package(self):
        package = parse_package_format("6 x 33 cl")
        self.assertEqual(package.pack_count, 6)
        self.assertEqual(package.quantity_value, 33.0)
        self.assertEqual(package.total_quantity_value, 198.0)
        self.assertEqual(package.total_quantity_unit, "cl")

    def test_parses_unit_price(self):
        value, unit = parse_unit_price("Contenu : 350 g - Soit 21,49 € / Kg")
        self.assertEqual(value, 21.49)
        self.assertEqual(unit, "kg")

    def test_builds_stable_duplicate_key(self):
        key = build_duplicate_key(
            store_slug="leaderprice-lp-ermitage",
            product_url="https://leaderdrive.re/x",
            normalized_product_name="eau",
            brand="cilaos",
            package_format="1.25 L",
        )
        self.assertEqual(key, "leaderprice-lp-ermitage|https://leaderdrive.re/x")

    def test_normalizes_lookup_key(self):
        self.assertEqual(normalize_lookup_key("Crème brûlée d'été"), "creme brulee d ete")


if __name__ == "__main__":
    unittest.main()
