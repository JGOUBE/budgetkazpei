import unittest
from datetime import datetime, timedelta, timezone

from app.db.repositories import DryRunRepositories, InMemoryRepositories, SupabaseRepositories
from app.models.candidate import Candidate
from app.models.document import SourceDocument
from app.models.source import SourceDefinition


class RepositoryTests(unittest.TestCase):
    def test_two_successive_snapshots_same_hash_are_allowed(self):
        repositories = InMemoryRepositories()
        document = SourceDocument(
            source_slug="source",
            source_url="https://example.com",
            final_url="https://example.com",
            content_type="text/html",
            http_status=200,
            content_bytes=b"ok",
            extracted_text="ok",
            sha256="same-hash",
        )

        first_id = repositories.record_snapshot("source", "source:1", document, changed=True, status="parsed")
        second_id = repositories.record_snapshot("source", "source:1", document, changed=False, status="skipped_unchanged")

        self.assertNotEqual(first_id, second_id)
        self.assertEqual(len(repositories.snapshots), 2)

    def test_failed_snapshot_without_http_status_and_sha256_is_allowed(self):
        repositories = InMemoryRepositories()
        document = SourceDocument(
            source_slug="source",
            source_url="https://example.com",
            final_url=None,
            content_type=None,
            http_status=None,
            content_bytes=b"",
            extracted_text="",
            sha256=None,
            content_length_hint=None,
        )

        snapshot_id = repositories.record_snapshot("source", "source:1", document, changed=False, status="failed", error_message="timeout")

        self.assertIn(snapshot_id, repositories.snapshots)
        self.assertIsNone(repositories.snapshots[snapshot_id]["http_status"])
        self.assertIsNone(repositories.snapshots[snapshot_id]["sha256"])

    def test_same_external_key_with_different_sources_is_allowed(self):
        repositories = InMemoryRepositories()
        first = Candidate(
            source_slug="source-a",
            external_key="same-key",
            content_family="shopping",
            content_kind="promotion",
            title="Promo A",
            description="Promo A",
            source_url="https://example.com/a",
            scope_type="island",
        )
        second = Candidate(
            source_slug="source-b",
            external_key="same-key",
            content_family="shopping",
            content_kind="promotion",
            title="Promo B",
            description="Promo B",
            source_url="https://example.com/b",
            scope_type="island",
        )

        repositories.save_candidate("source-id-a", "snapshot-a", first)
        repositories.save_candidate("source-id-b", "snapshot-b", second)

        self.assertEqual(len(repositories.candidates), 2)

    def test_dry_run_repository_persists_only_technical_records(self):
        technical = InMemoryRepositories()
        repositories = DryRunRepositories(technical)
        document = SourceDocument(
            source_slug="source",
            source_url="https://example.com",
            final_url="https://example.com",
            content_type="text/html",
            http_status=200,
            content_bytes=b"ok",
            extracted_text="ok",
            sha256="same-hash",
        )
        candidate = Candidate(
            source_slug="source",
            external_key="candidate",
            content_family="shopping",
            content_kind="promotion",
            title="Promo",
            description="Promo",
            source_url="https://example.com",
            scope_type="island",
        )

        repositories.start_run("run-1", "manual", "dry-run")
        repositories.ensure_source(type("Source", (), {"slug": "source"})())
        repositories.record_snapshot("source", "source:1", document, changed=True, status="parsed")
        repositories.save_candidate("source:1", "snapshot:1", candidate)
        repositories.finish_run(technical.runs["run-1"])

        self.assertEqual(len(technical.runs), 1)
        self.assertEqual(len(technical.snapshots), 1)
        self.assertEqual(len(technical.candidates), 0)
        self.assertEqual(len(technical.good_deals), 0)

    def test_expiration_is_idempotent_after_first_real_pass(self):
        repositories = InMemoryRepositories()
        now = datetime(2026, 7, 26, 12, 0, tzinfo=timezone.utc)
        repositories.good_deals["deal:1"] = {
            "collector_source_slug": "source",
            "is_active": True,
            "content_kind": "promotion",
            "ends_at": (now - timedelta(days=1)).isoformat(),
            "source_still_available": True,
        }
        repositories.promotions["promo:1"] = {
            "collector_source_slug": "source",
            "is_active": True,
            "ends_at": (now - timedelta(days=1)).isoformat(),
        }
        repositories.catalogs["catalog:1"] = {
            "collector_source_slug": "source",
            "is_active": True,
            "ends_at": (now - timedelta(days=1)).isoformat(),
        }
        candidate = Candidate(
            source_slug="source",
            external_key="candidate:1",
            content_family="shopping",
            content_kind="promotion",
            title="Promo",
            description="Promo",
            source_url="https://example.com",
            scope_type="island",
            ends_at=now - timedelta(days=1),
            status="approved",
        )
        repositories.save_candidate("source:1", "snapshot:1", candidate)

        first = repositories.expire_stale_records(dry_run=False, now=now)
        second = repositories.expire_stale_records(dry_run=False, now=now)

        self.assertEqual(first.good_deals, 1)
        self.assertEqual(first.promotions, 1)
        self.assertEqual(first.catalogs, 1)
        self.assertEqual(first.candidates, 1)
        self.assertEqual(second.good_deals, 0)
        self.assertEqual(second.promotions, 0)
        self.assertEqual(second.catalogs, 0)
        self.assertEqual(second.candidates, 0)

    def test_pending_publication_lists_only_unpublished_approved_candidates(self):
        repositories = InMemoryRepositories()
        approved = Candidate(
            source_slug="source",
            external_key="approved:1",
            content_family="shopping",
            content_kind="promotion",
            title="Approved",
            description="Approved",
            source_url="https://example.com/a",
            scope_type="island",
            status="approved",
        )
        published = Candidate(
            source_slug="source",
            external_key="published:1",
            content_family="shopping",
            content_kind="promotion",
            title="Published",
            description="Published",
            source_url="https://example.com/p",
            scope_type="island",
            status="published",
            published_good_deal_id="deal:published",
        )
        review = Candidate(
            source_slug="source",
            external_key="review:1",
            content_family="shopping",
            content_kind="promotion",
            title="Review",
            description="Review",
            source_url="https://example.com/r",
            scope_type="island",
            status="needs_review",
        )

        repositories.save_candidate("source:1", "snapshot:1", approved)
        repositories.save_candidate("source:1", "snapshot:1", published)
        repositories.save_candidate("source:1", "snapshot:1", review)

        pending = repositories.list_candidates_pending_publication()

        self.assertEqual([candidate.external_key for candidate in pending], ["approved:1"])


    def test_failed_publish_snapshot_requires_reprocessing_same_hash(self):
        repository = InMemoryRepositories()
        doc = SourceDocument(
            source_slug="source", source_url="https://example.com",
            final_url="https://example.com", content_type="text/html",
            http_status=200, content_bytes=b"catalogues", extracted_text="catalogues",
            sha256="stable-hash",
        )
        repository.record_snapshot("source", "id", doc, changed=True, status="parsed")
        self.assertEqual(repository.get_last_snapshot_hash("source"), "stable-hash")
        repository.record_snapshot("source", "id", doc, changed=False, status="failed", error_message="publication failed")
        self.assertIsNone(repository.get_last_snapshot_hash("source"))
        repository.record_snapshot("source", "id", doc, changed=True, status="parsed")
        self.assertEqual(repository.get_last_snapshot_hash("source"), "stable-hash")

    def test_same_external_key_is_eligible_for_retry_but_new_leaflet_is_not(self):
        repository = InMemoryRepositories()
        saved = Candidate(
            source_slug="source", external_key="source:leaflet-a",
            content_family="shopping", content_kind="promotion",
            title="Catalogue", description="Catalogue",
            source_url="https://example.com/a", scope_type="island",
            duplicate_key="same-leaflet",
        )
        repository.save_candidate("source:id", "snapshot:1", saved)
        self.assertIsNone(
            repository.find_duplicate_candidate_id("same-leaflet", external_key="source:leaflet-a")
        )
        self.assertIsNotNone(
            repository.find_duplicate_candidate_id("same-leaflet", external_key="source:leaflet-b")
        )

    def test_source_disabled_by_admin_is_not_enabled(self):
        repository = InMemoryRepositories()
        source = SourceDefinition(
            slug="source", name="Source disabled", content_family="shopping",
            source_type="html", source_url="https://example.com",
            official_domain="example.com", parser_key="generic_catalog",
            scope_type="island", is_active=False,
        )
        repository.ensure_source(source)
        self.assertFalse(repository.is_source_enabled(source.slug))
        self.assertTrue(repository.is_source_enabled("unregistered"))

    def test_supabase_failed_snapshot_must_not_hide_publish_failure(self):
        class FakeClient:
            def __init__(self, data):
                self.data = data
                self.calls = []

            def select(self, table, *, filters=None, columns="*"):
                self.calls.append((table, filters, columns))
                return self.data

        client = FakeClient([{"sha256": "same-hash", "processing_status": "failed"}])
        repository = SupabaseRepositories(client)
        self.assertIsNone(repository.get_last_snapshot_hash("source"))
        self.assertEqual(client.calls[0][2], "sha256,processing_status")
        self.assertNotIn("sha256", client.calls[0][1])
        client.data = [{"sha256": "same-hash", "processing_status": "parsed"}]
        self.assertEqual(repository.get_last_snapshot_hash("source"), "same-hash")

    def test_supabase_source_disable_and_duplicate_exclusion(self):
        class FakeClient:
            def __init__(self):
                self.calls = []

            def select(self, table, *, filters=None, columns="*"):
                self.calls.append((table, filters, columns))
                if table == "good_deal_sources":
                    return [{"is_active": False}]
                return []

        client = FakeClient()
        repository = SupabaseRepositories(client)
        self.assertFalse(repository.is_source_enabled("disabled-source"))
        self.assertIsNone(repository.find_duplicate_candidate_id("digest", external_key="catalogue-a"))
        self.assertEqual(client.calls[1][1]["external_key"], "neq.catalogue-a")


if __name__ == "__main__":
    unittest.main()
