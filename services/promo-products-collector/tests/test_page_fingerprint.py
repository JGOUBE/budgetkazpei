from datetime import datetime, timezone
import unittest

from app.services.hashing import hash_chunks, sha256_text
from app.services.page_fingerprint import PageAssetMetadata, PageSnapshotRecord, plan_page_snapshot


class PageFingerprintTests(unittest.TestCase):
    def test_sha256_is_stable(self):
        left = hash_chunks([b"abc", b"123"])
        right = hash_chunks([b"abc123"])
        self.assertEqual(left.sha256, right.sha256)
        self.assertEqual(left.size_bytes, 6)
        self.assertEqual(right.sha256, sha256_text("abc123"))

    def test_new_page_is_marked_discovered(self):
        now = datetime(2026, 7, 28, 8, 0, tzinfo=timezone.utc)
        decision = plan_page_snapshot(
            catalog_id="catalog:1",
            current=PageAssetMetadata(
                page_number=1,
                asset_url="https://example.com/page-1.webp",
                asset_sha256="hash-a",
                asset_content_type="image/webp",
                asset_size_bytes=1234,
                source_last_modified="Tue, 28 Jul 2026 08:00:00 GMT",
            ),
            previous=None,
            extraction_version="fliphtml5_pages_v1",
            now=now,
        )
        self.assertEqual(decision.decision, "new")
        self.assertEqual(decision.snapshot.extraction_status, "discovered")

    def test_unchanged_page_is_not_marked_pending_extraction(self):
        now = datetime(2026, 7, 28, 9, 0, tzinfo=timezone.utc)
        previous = PageSnapshotRecord(
            catalog_id="catalog:1",
            page_number=2,
            asset_url="https://example.com/page-2.webp",
            asset_sha256="same-hash",
            asset_content_type="image/webp",
            asset_size_bytes=5678,
            source_last_modified="Tue, 28 Jul 2026 08:00:00 GMT",
            extraction_status="extracted",
            extraction_version="fliphtml5_pages_v1",
            first_seen_at=now,
            last_seen_at=now,
            extracted_at=now,
            purge_after=None,
        )
        decision = plan_page_snapshot(
            catalog_id="catalog:1",
            current=PageAssetMetadata(
                page_number=2,
                asset_url="https://example.com/page-2.webp",
                asset_sha256="same-hash",
                asset_content_type="image/webp",
                asset_size_bytes=5678,
                source_last_modified="Tue, 28 Jul 2026 08:00:00 GMT",
            ),
            previous=previous,
            extraction_version="fliphtml5_pages_v1",
            now=now,
        )
        self.assertEqual(decision.decision, "unchanged")
        self.assertEqual(decision.snapshot.extraction_status, "unchanged")

    def test_changed_page_is_marked_pending_extraction(self):
        now = datetime(2026, 7, 28, 10, 0, tzinfo=timezone.utc)
        previous = PageSnapshotRecord(
            catalog_id="catalog:1",
            page_number=3,
            asset_url="https://example.com/page-3.webp",
            asset_sha256="old-hash",
            asset_content_type="image/webp",
            asset_size_bytes=1000,
            source_last_modified="Tue, 28 Jul 2026 08:00:00 GMT",
            extraction_status="extracted",
            extraction_version="fliphtml5_pages_v1",
            first_seen_at=now,
            last_seen_at=now,
            extracted_at=now,
            purge_after=None,
        )
        decision = plan_page_snapshot(
            catalog_id="catalog:1",
            current=PageAssetMetadata(
                page_number=3,
                asset_url="https://example.com/page-3.webp",
                asset_sha256="new-hash",
                asset_content_type="image/webp",
                asset_size_bytes=1001,
                source_last_modified="Tue, 28 Jul 2026 09:00:00 GMT",
            ),
            previous=previous,
            extraction_version="fliphtml5_pages_v1",
            now=now,
        )
        self.assertEqual(decision.decision, "changed")
        self.assertEqual(decision.snapshot.extraction_status, "pending_extraction")


if __name__ == "__main__":
    unittest.main()
