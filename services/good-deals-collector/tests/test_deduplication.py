import unittest
from datetime import datetime

from app.models.candidate import Candidate
from app.services.deduplication import build_duplicate_key
from app.services.normalization import normalize_text


class DeduplicationTests(unittest.TestCase):
    def test_promotion_duplicate_key_ignores_surface_variants(self):
        first = Candidate(
            source_slug="source",
            external_key="first",
            content_family="shopping",
            content_kind="promotion",
            title="Coca 6X1L5",
            description="promo",
            source_url="https://example.com",
            scope_type="island",
            retailer_slug="retailer",
            product_name="COCA 6X1L5",
            normalized_product_name=normalize_text("Coca Cola 6 x 1,5 L"),
            size_label="6 x 1,5 L",
            promo_price=5.99,
            starts_at=datetime(2026, 7, 1),
            ends_at=datetime(2026, 7, 15),
        )
        second = Candidate(
            source_slug="source",
            external_key="second",
            content_family="shopping",
            content_kind="promotion",
            title="Coca-Cola Original pack 6",
            description="promo",
            source_url="https://example.com",
            scope_type="island",
            retailer_slug="retailer",
            product_name="Coca-Cola Original pack 6",
            normalized_product_name=normalize_text("Coca Cola 6 x 1,5 L"),
            size_label="6x1.5L",
            promo_price=5.99,
            starts_at=datetime(2026, 7, 1),
            ends_at=datetime(2026, 7, 15),
        )
        self.assertEqual(build_duplicate_key(first), build_duplicate_key(second))


    def test_distinct_catalogues_same_title_and_dates_are_not_duplicates(self):
        common = dict(
            source_slug="run-market-reunion-home",
            content_family="shopping",
            content_kind="promotion",
            title="NOUVEAU CATALOGUE",
            description="Catalogue",
            scope_type="island",
            retailer_slug="run-market-reunion",
            product_name="NOUVEAU CATALOGUE",
            normalized_product_name="nouveau catalogue",
            starts_at=datetime(2026, 10, 26),
            ends_at=datetime(2026, 11, 8),
            tags=["catalogue", "run-market"],
        )
        first = Candidate(
            external_key="run-market-reunion-home:calameo-1",
            source_url="https://www.calameo.com/read/006370411296d361b400d",
            **common,
        )
        second = Candidate(
            external_key="run-market-reunion-home:foire-aux-vins",
            source_url="https://runmarket.interactive-catalogue.com/foire-aux-vins-26-oct-au-8-nov-2026/",
            **common,
        )
        same_with_tracking = Candidate(
            external_key="run-market-reunion-home:calameo-1-copy",
            source_url="https://www.calameo.com/read/006370411296d361b400d?utm_source=home",
            **common,
        )
        self.assertNotEqual(build_duplicate_key(first), build_duplicate_key(second))
        self.assertEqual(build_duplicate_key(first), build_duplicate_key(same_with_tracking))


if __name__ == "__main__":
    unittest.main()
