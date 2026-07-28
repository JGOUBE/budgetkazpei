from __future__ import annotations

from pathlib import Path
import unittest

from app.extractors.leader_drive_products import (
    choose_pilot_store,
    parse_product_detail_page,
    parse_product_list_page,
    parse_public_stores,
    parse_store_categories,
    select_representative_categories,
)


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class LeaderDriveProductExtractionTests(unittest.TestCase):
    def test_parses_public_stores_and_prefers_west_pilot(self):
        html = (FIXTURES / "leader_price_root.html").read_text(encoding="utf-8")
        stores = parse_public_stores(html)
        self.assertEqual(len(stores), 3)
        self.assertEqual(choose_pilot_store(stores).slug, "leaderprice-lp-ermitage")

    def test_parses_store_categories_and_representative_selection(self):
        html = (FIXTURES / "leader_price_store.html").read_text(encoding="utf-8")
        categories = parse_store_categories(html)
        selected = select_representative_categories(categories)
        self.assertEqual(len(categories), 5)
        self.assertEqual(
            [item.subcategory for item in selected],
            [
                "EPICERIE SALEE",
                "JUS DE FRUITS ET SIROPS",
                "CREMERIE",
                "HYGIENE, SOINS DU CORPS",
                "PRODUITS NETTOYANT",
            ],
        )

    def test_parses_observed_category_cards(self):
        html = (FIXTURES / "leader_price_observed_category.html").read_text(encoding="utf-8")
        audit = parse_product_list_page(
            html,
            page_url="https://leaderdrive.re/leaderprice-lp-ermitage/articles/epicerie-salee",
            category="PRODUITS BIO ET ECOLO",
            subcategory="EPICERIE SALEE",
        )
        self.assertEqual(audit.estimated_total_products, 45)
        self.assertEqual(audit.pagination_pages, [1, 2])
        self.assertEqual(len(audit.cards), 6)

        first = audit.cards[0]
        self.assertEqual(first.brand, "BJORG")
        self.assertEqual(first.product_label, "Biscuits fourrés goût chocolat noir bio")
        self.assertEqual(first.current_price, 5.20)
        self.assertEqual(first.original_price, None)
        self.assertEqual(first.unit_price, 34.67)
        self.assertEqual(first.unit_price_unit, "kg")

        multipack = audit.cards[1]
        self.assertEqual(multipack.product_content, "Contenu : 6 x 33 cl")
        self.assertEqual(multipack.unit_price, 2.47)
        self.assertEqual(multipack.unit_price_unit, "l")

        unavailable = audit.cards[4]
        self.assertEqual(unavailable.availability_status, "unavailable")

        invalid_price = audit.cards[5]
        self.assertIsNone(invalid_price.current_price)

    def test_parses_promotions_and_immediate_discount(self):
        html = (FIXTURES / "leader_price_promotions.html").read_text(encoding="utf-8")
        audit = parse_product_list_page(
            html,
            page_url="https://leaderdrive.re/leaderprice-lp-ermitage/promotions",
            category=None,
            subcategory="PROMOTIONS",
        )
        self.assertEqual(audit.estimated_total_products, 419)
        self.assertEqual(audit.pagination_pages, [1, 2, 9])
        self.assertEqual(len(audit.cards), 5)

        promo = audit.cards[0]
        self.assertEqual(promo.promotion_badge, "Prix Promo")
        self.assertEqual(promo.original_price, 0.98)
        self.assertEqual(promo.current_price, 0.89)
        self.assertEqual(promo.offer_mechanism, "direct_discount")

        immediate = audit.cards[1]
        self.assertEqual(immediate.promotion_badge, "Remise immédiate")
        self.assertEqual(immediate.original_price, 0.59)
        self.assertEqual(immediate.current_price, 0.49)

        loyalty = audit.cards[2]
        self.assertEqual(loyalty.promotion_badge, "Fidélité")
        self.assertEqual(loyalty.loyalty_amount, 0.40)
        self.assertEqual(loyalty.loyalty_type, "card_credit")

    def test_parses_product_detail(self):
        html = (FIXTURES / "leader_price_product_detail.html").read_text(encoding="utf-8")
        detail = parse_product_detail_page(
            html,
            product_url="https://leaderdrive.re/leaderprice-lp-ermitage/articles/epicerie-salee/biscuits-fourres-gout-chocolat-noir-bio",
        )
        self.assertEqual(detail.brand, "BJORG")
        self.assertEqual(detail.title, "Biscuits fourrés goût chocolat noir bio")
        self.assertEqual(detail.package_format, "150 g - Soit 34,67 € / Kg")
        self.assertEqual(detail.current_price, 5.20)
        self.assertEqual(detail.unit_price, 34.67)
        self.assertEqual(detail.unit_price_unit, "kg")


if __name__ == "__main__":
    unittest.main()
