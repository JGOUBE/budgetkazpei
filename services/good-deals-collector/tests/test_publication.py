import unittest
from datetime import datetime

from app.db.publisher import PublisherService
from app.db.repositories import InMemoryRepositories
from app.models.candidate import Candidate


class PublicationTests(unittest.TestCase):
    def test_publication_creates_business_and_good_deal(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="carrefour-reunion-catalogues",
            external_key="candidate:1",
            content_family="shopping",
            content_kind="promotion",
            title="Tomates 0,99 EUR",
            description="Tomates promo",
            source_url="https://www.carrefour-reunion.com/catalogues/carrefour",
            scope_type="island",
            business_name="Carrefour Reunion",
            retailer_slug="carrefour-reunion",
            product_name="Tomates",
            normalized_product_name="tomates",
            category="shopping",
            promo_price=0.99,
            starts_at=datetime(2026, 7, 1),
            ends_at=datetime(2026, 7, 15),
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        published_id = publisher.publish_candidate(candidate)

        self.assertIsNotNone(published_id)
        self.assertEqual(candidate.status, "published")
        self.assertEqual(len(repositories.businesses), 1)
        self.assertEqual(len(repositories.good_deals), 1)
        self.assertIn("carrefour-reunion", repositories.businesses)


if __name__ == "__main__":
    unittest.main()
