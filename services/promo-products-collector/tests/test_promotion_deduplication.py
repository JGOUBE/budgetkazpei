import unittest

from app.models.promotion_candidate import BoundingBox, PromotionCandidate
from app.services.promotion_deduplication import annotate_duplicates


def _candidate(region_id: str, page_number: int, left: float, top: float) -> PromotionCandidate:
    return PromotionCandidate(
        page_number=page_number,
        region_id=region_id,
        bounding_box=BoundingBox(left=left, top=top, width=180, height=90),
        raw_text="PATES 500 g\n1,29",
        product_name="PATES 500 g",
        normalized_product_name="pates 500 g",
        brand=None,
        package_format="500 g",
        quantity_value=500.0,
        quantity_unit="g",
        promo_price=1.29,
        original_price=None,
        discount_percent=None,
        unit_price=None,
        unit_price_unit=None,
        loyalty_amount=None,
        loyalty_type=None,
        offer_mechanism="simple_price",
        conditions=None,
        starts_at="2026-07-20",
        ends_at="2026-08-02",
        extraction_confidence=92,
        candidate_status="reliable",
    )


class PromotionDeduplicationTests(unittest.TestCase):
    def test_marks_duplicate_on_same_page(self):
        candidates = [
            _candidate("r1", 1, 10, 10),
            _candidate("r2", 1, 40, 30),
        ]
        summary = annotate_duplicates(candidates)
        self.assertEqual(summary.duplicate_same_page, 1)
        self.assertTrue(candidates[1].is_duplicate)
        self.assertEqual(candidates[1].duplicate_of, "r1")

    def test_marks_duplicate_across_pages(self):
        candidates = [
            _candidate("r1", 1, 10, 10),
            _candidate("r2", 2, 600, 400),
        ]
        summary = annotate_duplicates(candidates)
        self.assertEqual(summary.duplicate_cross_page, 1)
        self.assertTrue(candidates[1].is_duplicate)
        self.assertEqual(candidates[1].duplicate_of, "r1")


if __name__ == "__main__":
    unittest.main()
