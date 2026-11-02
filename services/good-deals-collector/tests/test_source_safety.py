from __future__ import annotations

import unittest
from unittest.mock import Mock

from app.collectors.registry import get_default_sources
from app.db.repositories import InMemoryRepositories, SupabaseRepositories
from app.main import process_source
from app.models.candidate import Candidate
from app.services.deduplication import build_duplicate_key


class SourceSafetyTests(unittest.TestCase):
    def setUp(self):
        self.source = get_default_sources()[0]

    def test_disabled_source_stops_before_any_http_request(self):
        repo = Mock()
        repo.is_source_enabled.return_value = False
        collector = Mock()
        result = process_source(
            self.source, None, repo,
            {"html": collector},
            {self.source.parser_key: Mock()},
            None,
        )
        self.assertEqual(result.skipped_reason, "disabled")
        collector.collect.assert_not_called()
        repo.ensure_source.assert_not_called()

    def test_one_missing_source_does_not_crash_whole_run(self):
        repo = Mock()
        repo.is_source_enabled.return_value = True
        repo.ensure_source.side_effect = LookupError("missing registration")
        collector = Mock()
        result = process_source(
            self.source, None, repo,
            {"html": collector},
            {self.source.parser_key: Mock()},
            None,
        )
        self.assertIn("missing registration", result.error_message)
        collector.collect.assert_not_called()
        repo.record_snapshot.assert_not_called()

    def test_error_snapshot_failure_does_not_mask_original_error(self):
        repo = Mock()
        repo.is_source_enabled.return_value = True
        repo.ensure_source.return_value = "source-id"
        repo.record_snapshot.side_effect = RuntimeError("storage unavailable")
        collector = Mock()
        collector.collect.side_effect = ValueError("source HTTP failed")
        result = process_source(
            self.source, None, repo,
            {"html": collector},
            {self.source.parser_key: Mock()},
            None,
        )
        self.assertIn("source HTTP failed", result.error_message)

    def test_supabase_disabling_overrides_registry(self):
        client = Mock()
        client.select.return_value = [{"is_active": False}]
        repo = SupabaseRepositories(client)
        self.assertFalse(repo.is_source_enabled(self.source.slug))
        client.select.return_value = [{"is_active": True}]
        self.assertTrue(repo.is_source_enabled(self.source.slug))

    def test_failed_snapshot_does_not_get_reused_as_successful(self):
        client = Mock()
        repo = SupabaseRepositories(client)
        client.select.return_value = [{"processing_status": "failed", "sha256": "hash1"}]
        self.assertIsNone(repo.get_last_snapshot_hash("carrefour-reunion-catalogues"))
        client.select.return_value = [{"processing_status": "parsed", "sha256": "hash1"}]
        self.assertEqual(repo.get_last_snapshot_hash("carrefour-reunion-catalogues"), "hash1")

    def test_database_duplicate_query_excludes_same_external_candidate(self):
        client = Mock()
        client.select.return_value = []
        repo = SupabaseRepositories(client)
        self.assertIsNone(repo.find_duplicate_candidate_id("same-content", external_key="same-catalogue"))
        filters = client.select.call_args.kwargs["filters"]
        self.assertEqual(filters["external_key"], "neq.same-catalogue")

    def test_in_memory_duplicate_uses_distinct_external_keys(self):
        repo = InMemoryRepositories()
        source_id = repo.ensure_source(self.source)
        candidate = Candidate(
            source_slug=self.source.slug,
            external_key="carrefour-reunion-catalogues:123",
            content_family="shopping",
            content_kind="promotion",
            title="Catalogue",
            description="Catalogue",
            source_url="https://www.carrefour-reunion.com/catalogues/carrefour/123",
            scope_type="island",
            retailer_slug="carrefour-reunion",
            tags=["catalogue"],
        )
        candidate.duplicate_key = build_duplicate_key(candidate)
        repo.save_candidate(source_id, None, candidate)
        self.assertIsNone(
            repo.find_duplicate_candidate_id(candidate.duplicate_key, external_key=candidate.external_key)
        )
        self.assertIsNotNone(
            repo.find_duplicate_candidate_id(candidate.duplicate_key, external_key="another-catalogue")
        )


if __name__ == "__main__":
    unittest.main()
