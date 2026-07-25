import unittest
from datetime import datetime, timedelta, timezone

from app.models.candidate import Candidate
from app.services.confidence import score_candidate


class ConfidenceTests(unittest.TestCase):
    def test_missing_end_date_for_promotion_requires_review(self):
        candidate = Candidate(
            source_slug="source",
            external_key="candidate",
            content_family="shopping",
            content_kind="promotion",
            title="Promo",
            description="Promo",
            source_url="https://example.com",
            scope_type="island",
            product_name="Produit",
            normalized_product_name="produit",
            promo_price=1.99,
        )
        score, _, errors, status = score_candidate(candidate)
        self.assertGreater(score, 0)
        self.assertIn("date_fin_absente", errors)
        self.assertEqual(status, "needs_review")

    def test_expired_content_is_flagged(self):
        candidate = Candidate(
            source_slug="source",
            external_key="candidate",
            content_family="event",
            content_kind="event",
            title="Evenement",
            description="Evenement",
            source_url="https://example.com",
            scope_type="commune",
            commune="Saint-Paul",
            starts_at=datetime.now(timezone.utc) - timedelta(days=2),
            ends_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        _, _, errors, status = score_candidate(candidate)
        self.assertIn("contenu_deja_expire", errors)
        self.assertEqual(status, "rejected")


if __name__ == "__main__":
    unittest.main()
