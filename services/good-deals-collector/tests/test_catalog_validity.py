from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from app.db.publisher import PublisherService
from app.db.repositories import InMemoryRepositories
from app.models.candidate import Candidate
from app.models.source import SourceDefinition
from app.services.catalog_period import publication_period
from app.services.confidence import score_candidate
from app.services.expiration import is_expired


class CatalogValidityTests(unittest.TestCase):
    @staticmethod
    def catalogue():
        return Candidate(
            source_slug="auchan-saint-louis-catalogues",
            external_key="auchan:valid-to-2026-11-08",
            content_family="shopping",
            content_kind="promotion",
            title="Catalogue du 3 au 8 novembre",
            description="Catalogue",
            source_url="https://www.auchansaintlouis.com/catalogues/example",
            scope_type="island",
            business_name="Auchan Saint-Louis",
            retailer_slug="auchan-saint-louis",
            category="shopping",
            starts_at=datetime(2026, 11, 3),
            ends_at=datetime(2026, 11, 8),
            tags=["catalogue"],
            status="approved",
            confidence_score=100,
        )

    def test_catalogue_expires_only_after_last_local_day(self):
        candidate = self.catalogue()
        start, end = publication_period(candidate)
        self.assertEqual(start.isoformat(), "2026-11-03T00:00:00+04:00")
        self.assertEqual(end.isoformat(), "2026-11-08T23:59:59+04:00")
        self.assertFalse(is_expired(candidate, now=datetime(2026, 11, 8, 16, 0, tzinfo=timezone.utc)))
        self.assertTrue(is_expired(candidate, now=datetime(2026, 11, 8, 20, 0, tzinfo=timezone.utc)))

    def test_publisher_saves_matching_inclusive_dates_in_catalogue_and_deal(self):
        candidate = self.catalogue()
        repositories = InMemoryRepositories()
        source = SourceDefinition(
            slug=candidate.source_slug,
            name="Auchan Saint-Louis",
            content_family="shopping",
            source_type="html",
            source_url="https://www.auchansaintlouis.com/les-catalogues",
            official_domain="auchansaintlouis.com",
            parser_key="auchan_saint_louis",
            scope_type="island",
        )
        source_id = repositories.ensure_source(source)
        repositories.save_candidate(source_id, None, candidate)
        PublisherService(repositories).publish_candidate(candidate)
        catalogue = next(iter(repositories.catalogs.values()))
        deal = next(iter(repositories.good_deals.values()))
        self.assertEqual(catalogue["ends_at"], "2026-11-08T23:59:59+04:00")
        self.assertEqual(deal["ends_at"], catalogue["ends_at"])
        self.assertEqual(deal["starts_at"], "2026-11-03T00:00:00+04:00")

    def test_timed_event_is_not_changed_to_end_of_day(self):
        event = Candidate(
            source_slug="mairie-saint-paul-events",
            external_key="event:1",
            content_family="event",
            content_kind="event",
            title="Evénement à 16 h",
            description="Evénement",
            source_url="https://www.mairie-saintpaul.re/",
            scope_type="commune",
            commune="Saint-Paul",
            starts_at=datetime(2026, 11, 8, 15, 0, tzinfo=timezone(timedelta(hours=4))),
            ends_at=datetime(2026, 11, 8, 16, 0, tzinfo=timezone(timedelta(hours=4))),
        )
        self.assertEqual(publication_period(event)[1], event.ends_at)
        self.assertTrue(is_expired(event, now=datetime(2026, 11, 8, 13, 0, tzinfo=timezone.utc)))

    def test_already_timezone_aware_catalogue_bounds_are_not_overwritten(self):
        candidate = self.catalogue()
        candidate.ends_at = datetime(2026, 11, 8, 20, 30, tzinfo=timezone(timedelta(hours=4)))
        self.assertEqual(publication_period(candidate)[1], candidate.ends_at)

    def test_scoring_does_not_reject_a_future_dated_catalogue(self):
        candidate = self.catalogue()
        future = datetime.now(timezone.utc) + timedelta(days=3)
        candidate.starts_at = (future - timedelta(days=1)).replace(tzinfo=None)
        candidate.ends_at = future.replace(tzinfo=None)
        _, _, errors, status = score_candidate(candidate)
        self.assertNotIn("contenu_deja_expire", errors)
        self.assertNotEqual(status, "rejected")


if __name__ == "__main__":
    unittest.main()
