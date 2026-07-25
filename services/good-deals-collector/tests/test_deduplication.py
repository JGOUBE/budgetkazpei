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


if __name__ == "__main__":
    unittest.main()
