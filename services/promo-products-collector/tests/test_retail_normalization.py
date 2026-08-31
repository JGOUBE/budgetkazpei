from __future__ import annotations

import unittest

from app.services.retail_product_normalization import (
    build_duplicate_key,
    normalize_lookup_key,
    parse_package_format,
    parse_unit_price,
    select_package_format,
)


class RetailNormalizationTests(unittest.TestCase):
    def test_parses_simple_package(self):
        package = parse_package_format("150 g")
        self.assertEqual(package.quantity_value, 150.0)
        self.assertEqual(package.quantity_unit, "g")
        self.assertEqual(package.total_quantity_value, 150.0)

    def test_strips_content_prefix_from_package(self):
        package = parse_package_format("Contenu : 75 cl")
        self.assertEqual(package.package_format, "75 cl")

    def test_unit_price_suffix_is_not_part_of_package(self):
        package = parse_package_format("Contenu : 350 g - Soit 21,49 € / Kg")
        self.assertEqual(package.package_format, "350 g")

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

    def test_duplicate_key_prefers_source_product_id(self):
        key = build_duplicate_key(
            store_slug="leaderprice-lp-ermitage",
            source_product_id="CARD-123",
            product_url="https://leaderdrive.re/articles/name-can-change",
            normalized_product_name="produit",
            brand="marque",
            package_format="500 g",
        )
        self.assertEqual(key, "leaderprice-lp-ermitage|source-id:card-123")

    def test_normalizes_lookup_key(self):
        self.assertEqual(normalize_lookup_key("Crème brûlée d'été"), "creme brulee d ete")

    def test_package_selection_prefers_card_over_detail(self):
        selected, source = select_package_format(
            card_product_content="Contenu : 75 cl",
            detail_package_format="65 cl",
            product_label="Spray nettoyant",
        )
        self.assertEqual((selected, source), ("75 cl", "card_product_content"))

    def test_package_selection_uses_scoped_detail_when_card_is_missing(self):
        selected, source = select_package_format(
            card_product_content=None,
            detail_package_format="500 g",
            product_label="Produit test",
        )
        self.assertEqual((selected, source), ("500 g", "detail_product_content"))

    def test_real_missing_content_cases_use_explicit_label_counts(self):
        cases = [
            ("Rasoirs jetables 3 lames - 4 rasoirs", "4 rasoirs"),
            ("Lingette nettoie sols agrumes - 15 lingettes", "15 lingettes"),
            ("Bloc WC eau bleue pour chasse d eau - 2 blocs", "2 blocs"),
        ]
        for label, expected in cases:
            with self.subTest(label=label):
                selected, source = select_package_format(
                    card_product_content=None,
                    detail_package_format=None,
                    product_label=label,
                )
                self.assertEqual((selected, source), (expected, "product_label_count"))

    def test_promotional_quantity_is_not_used_as_package(self):
        selected, source = select_package_format(
            card_product_content=None,
            detail_package_format=None,
            product_label="Capsules café 10 + 2 offertes",
        )
        self.assertEqual((selected, source), (None, None))


if __name__ == "__main__":
    unittest.main()
