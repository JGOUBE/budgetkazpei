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

    def test_catalog_candidate_creates_catalog_card_without_fake_product_rows(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="carrefour-reunion-catalogues",
            external_key="catalog:2026-07-20",
            content_family="shopping",
            content_kind="promotion",
            title="Les prix gagnants",
            description="Catalogue valable du 20 juillet au 2 aout 2026",
            source_url="https://www.carrefour-reunion.com/catalogues/carrefour/644-les-prix-gagnants",
            scope_type="island",
            business_name="Carrefour Reunion",
            retailer_slug="carrefour-reunion",
            category="shopping",
            tags=["catalogue", "carrefour"],
            starts_at=datetime(2026, 7, 20),
            ends_at=datetime(2026, 8, 2),
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        published_id = publisher.publish_candidate(candidate)

        self.assertIsNotNone(published_id)
        self.assertEqual(len(repositories.catalogs), 1)
        self.assertEqual(len(repositories.products), 0)
        self.assertEqual(len(repositories.aliases), 0)
        self.assertEqual(len(repositories.promotions), 0)
        self.assertEqual(len(repositories.good_deals), 1)

    def test_event_candidate_keeps_event_deal_type(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="mairie-saint-paul-events",
            external_key="event:saint-paul:concert-1",
            content_family="event",
            content_kind="event",
            title="Concert gratuit sur la place",
            description="Concert organise par la mairie",
            source_url="https://www.mairie-saintpaul.re/event/concert",
            scope_type="commune",
            organizer_name="Ville de Saint-Paul",
            commune="Saint-Paul",
            category="event",
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 21, 0),
            is_free=True,
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        published_id = publisher.publish_candidate(candidate)
        good_deal = repositories.good_deals[published_id]

        self.assertEqual(good_deal["deal_type"], "event")
        self.assertEqual(good_deal["content_kind"], "event")

    def test_permanent_leisure_candidate_stays_open_without_next_check(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="ville-port-permanent-leisure",
            external_key="leisure:piscine-port",
            content_family="permanent_leisure",
            content_kind="permanent_leisure",
            title="Piscine municipale",
            description="Acces libre hors fermeture exceptionnelle",
            source_url="https://www.ville-port.re/piscine",
            scope_type="commune",
            organizer_name="Ville du Port",
            commune="Le Port",
            category="leisure",
            is_free=True,
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        published_id = publisher.publish_candidate(candidate)
        good_deal = repositories.good_deals[published_id]

        self.assertEqual(good_deal["availability_status"], "open")
        self.assertEqual(good_deal["deal_type"], "free_activity")
        self.assertIsNone(good_deal["next_check_at"])

    def test_already_published_candidate_returns_existing_id(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="carrefour-reunion-catalogues",
            external_key="candidate:already-published",
            content_family="shopping",
            content_kind="promotion",
            title="Promo deja publiee",
            description="Promo deja publiee",
            source_url="https://example.com/catalogue",
            scope_type="island",
            business_name="Carrefour Reunion",
            retailer_slug="carrefour-reunion",
            status="published",
            published_good_deal_id="existing-good-deal-id",
        )

        published_id = publisher.publish_candidate(candidate)

        self.assertEqual(published_id, "existing-good-deal-id")
        self.assertEqual(len(repositories.good_deals), 0)


if __name__ == "__main__":
    unittest.main()
