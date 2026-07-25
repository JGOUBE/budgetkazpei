import unittest

from app.db.repositories import DryRunRepositories, InMemoryRepositories
from app.models.candidate import Candidate
from app.models.document import SourceDocument


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


if __name__ == "__main__":
    unittest.main()
