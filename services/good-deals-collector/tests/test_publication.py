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
        self.assertEqual(repositories.good_deals[published_id]["verification_status"], "published")

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
        self.assertEqual(good_deal["verification_status"], "published")

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
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        published_id = publisher.publish_candidate(candidate)
        good_deal = repositories.good_deals[published_id]

        self.assertEqual(good_deal["availability_status"], "open")
        self.assertEqual(good_deal["deal_type"], "local_service")
        self.assertIsNone(good_deal["next_check_at"])
        self.assertEqual(good_deal["content_kind"], "permanent_leisure")

    def test_product_promotion_candidate_creates_catalog_and_promotion(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="run-market-reunion-home",
            external_key="promo:run-market:cafe",
            content_family="shopping",
            content_kind="promotion",
            title="Cafe 250 g a prix reduit",
            description="Offre valable cette semaine",
            source_url="https://www.run-market.re/catalogue/cafe",
            scope_type="local",
            business_name="Run Market Reunion",
            retailer_slug="run-market-reunion",
            product_name="Cafe moulu 250 g",
            normalized_product_name="cafe moulu 250 g",
            brand="Maison",
            size_label="250g",
            category="shopping",
            promo_price=3.49,
            original_price=4.59,
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        published_id = publisher.publish_candidate(candidate)

        self.assertIsNotNone(published_id)
        self.assertEqual(len(repositories.catalogs), 1)
        self.assertEqual(len(repositories.products), 1)
        self.assertEqual(len(repositories.promotions), 1)
        self.assertEqual(repositories.good_deals[published_id]["scope_type"], "local")
        self.assertEqual(repositories.good_deals[published_id]["deal_type"], "promotion")

    def test_invalid_scope_type_is_rejected_without_partial_publication(self):
        repositories = InMemoryRepositories()
        publisher = PublisherService(repositories)
        candidate = Candidate(
            source_slug="carrefour-reunion-catalogues",
            external_key="catalog:invalid-scope",
            content_family="shopping",
            content_kind="promotion",
            title="Catalogue invalide",
            description="Scope invalide",
            source_url="https://www.carrefour-reunion.com/catalogues/carrefour/invalid",
            scope_type="store",
            business_name="Carrefour Reunion",
            retailer_slug="carrefour-reunion",
            tags=["catalogue"],
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        with self.assertRaisesRegex(ValueError, "invalid scope_type for good deal publication: store"):
            publisher.publish_candidate(candidate)

        self.assertEqual(candidate.status, "approved")
        self.assertIsNone(candidate.published_good_deal_id)
        self.assertEqual(len(repositories.businesses), 0)
        self.assertEqual(len(repositories.catalogs), 0)
        self.assertEqual(len(repositories.products), 0)
        self.assertEqual(len(repositories.promotions), 0)
        self.assertEqual(len(repositories.good_deals), 0)

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
