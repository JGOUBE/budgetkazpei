import unittest
from datetime import datetime

from app.db.publisher import PublisherService
from app.db.repositories import InMemoryRepositories
from app.models.candidate import Candidate


class IdempotenceTests(unittest.TestCase):
    def test_repeated_publication_keeps_single_business_row(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="source",
            external_key="candidate:repeat",
            content_family="shopping",
            content_kind="promotion",
            title="Cafe 3,99 EUR",
            description="Cafe promo",
            source_url="https://example.com",
            scope_type="island",
            business_name="Magasins U Reunion",
            retailer_slug="magasins-u-reunion",
            product_name="Cafe",
            normalized_product_name="cafe",
            category="shopping",
            promo_price=3.99,
            starts_at=datetime(2026, 7, 21),
            ends_at=datetime(2026, 8, 2),
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        first_id = publisher.publish_candidate(candidate)
        second_id = publisher.publish_candidate(candidate)

        self.assertEqual(first_id, second_id)
        self.assertEqual(len(repositories.businesses), 1)
        self.assertEqual(len(repositories.good_deals), 1)

    def test_same_external_key_with_different_source_slugs_creates_two_rows(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        first = Candidate(
            source_slug="source-a",
            external_key="shared-key",
            content_family="shopping",
            content_kind="promotion",
            title="Promo A",
            description="Promo A",
            source_url="https://example.com/a",
            scope_type="island",
            business_name="Run Market Reunion",
            retailer_slug="run-market-reunion",
            product_name="Cafe",
            normalized_product_name="cafe",
            category="shopping",
            promo_price=2.99,
            starts_at=datetime(2026, 7, 1),
            ends_at=datetime(2026, 7, 15),
            status="approved",
        )
        second = Candidate(
            source_slug="source-b",
            external_key="shared-key",
            content_family="shopping",
            content_kind="promotion",
            title="Promo B",
            description="Promo B",
            source_url="https://example.com/b",
            scope_type="island",
            business_name="Run Market Reunion",
            retailer_slug="run-market-reunion",
            product_name="Cafe",
            normalized_product_name="cafe",
            category="shopping",
            promo_price=2.99,
            starts_at=datetime(2026, 7, 1),
            ends_at=datetime(2026, 7, 15),
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", first)
        repositories.save_candidate("source:2", "snapshot:2", second)

        first_id = publisher.publish_candidate(first)
        second_id = publisher.publish_candidate(second)

        self.assertNotEqual(first_id, second_id)
        self.assertEqual(len(repositories.good_deals), 2)


if __name__ == "__main__":
    unittest.main()
