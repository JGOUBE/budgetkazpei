from __future__ import annotations

import unittest

from app.models.retail_price_observation import RetailPriceObservation
from app.services.retail_price_deduplication import deduplicate_observations
from app.services.retail_product_matching import ProductReference, simulate_matching


def _observation(*, price_type: str, promotion_proven: bool, current_price: float, original_price: float | None = None):
    return RetailPriceObservation(
        source_type="leader_drive_html",
        source_url="https://leaderdrive.re/page",
        source_product_id="123",
        source_category_id="EPICERIE SALEE",
        source_observed_at="2026-07-28T10:00:00Z",
        retailer_slug="leader-price-reunion",
        retailer_name="Leader Price Réunion",
        store_slug="leaderprice-lp-ermitage",
        store_name="LP Ermitage",
        channel="public_drive",
        raw_product_name="Eau naturelle",
        product_name="Eau naturelle",
        normalized_product_name="eau naturelle",
        brand="CILAOS",
        package_format="1.25 L",
        quantity_value=1.25,
        quantity_unit="l",
        pack_count=None,
        total_quantity_value=1.25,
        total_quantity_unit="l",
        barcode=None,
        category="BOISSONS",
        subcategory="EAUX",
        image_url=None,
        product_url="https://leaderdrive.re/product/eau",
        current_price=current_price,
        original_price=original_price,
        unit_price=0.71,
        unit_price_unit="l",
        currency="EUR",
        price_type=price_type,
        promotion_proven=promotion_proven,
        promotion_evidence="old_price_and_new_price" if promotion_proven else None,
        promo_badge="Prix Promo" if promotion_proven else None,
        discount_percent=9.18 if promotion_proven else None,
        loyalty_amount=None,
        loyalty_type=None,
        offer_mechanism="direct_discount" if promotion_proven else None,
        conditions=None,
        starts_at=None,
        ends_at=None,
        extraction_confidence=95 if promotion_proven else 80,
        validation_errors=[],
        availability_status="available",
        raw_evidence={},
        duplicate_key="leaderprice-lp-ermitage|https://leaderdrive.re/product/eau",
    )


class RetailDeduplicationAndMatchingTests(unittest.TestCase):
    def test_prefers_promotion_on_duplicate_product(self):
        observed = _observation(price_type="observed_price", promotion_proven=False, current_price=0.98)
        promo = _observation(price_type="promotion", promotion_proven=True, current_price=0.89, original_price=0.98)
        unique_items, summary = deduplicate_observations([observed, promo])
        self.assertEqual(summary.duplicates, 1)
        self.assertEqual(len(unique_items), 1)
        self.assertEqual(unique_items[0].price_type, "promotion")

    def test_matching_marks_backend_unavailable_without_references(self):
        observation = _observation(price_type="observed_price", promotion_proven=False, current_price=0.98)
        summary = simulate_matching([observation], references=None)
        self.assertEqual(summary.backend, "unavailable")
        self.assertEqual(summary.unmatched, 1)
        self.assertIn("matching_backend_unavailable_in_local_session", observation.match_warnings)

    def test_matching_can_resolve_exact_reference(self):
        observation = _observation(price_type="observed_price", promotion_proven=False, current_price=0.98)
        reference = ProductReference(
            product_id="prod-1",
            canonical_name="Eau naturelle",
            brand="CILAOS",
            package_format="1.25 L",
        )
        summary = simulate_matching([observation], references=[reference])
        self.assertEqual(summary.matched, 1)
        self.assertEqual(observation.matched_market_product_id, "prod-1")
        self.assertEqual(observation.match_method, "exact")


if __name__ == "__main__":
    unittest.main()
