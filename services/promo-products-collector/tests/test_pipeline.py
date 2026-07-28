from pathlib import Path
import tempfile
import unittest

from app.main import PageHashMetadata, RunReport, TextDocument, run
from app.db.repositories import InMemoryPageSnapshotRepository
from app.settings import Settings


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class _FakeFetcher:
    def __init__(self, url_map: dict[str, object]) -> None:
        self.url_map = url_map
        self.asset_fetches: list[str] = []

    def fetch_text(self, url: str, *, allowed_hosts, settings) -> TextDocument:
        payload = self.url_map[url]
        if not isinstance(payload, str):
            raise AssertionError(f"expected text payload for {url}")
        return TextDocument(url=url, content_type="text/html", text=payload)

    def fetch_asset_metadata(self, url: str, *, allowed_hosts, settings) -> PageHashMetadata:
        payload = self.url_map[url]
        if not isinstance(payload, dict):
            raise AssertionError(f"expected asset payload for {url}")
        self.asset_fetches.append(url)
        return PageHashMetadata(
            url=url,
            sha256=str(payload["sha256"]),
            size_bytes=int(payload["size_bytes"]),
            content_type=str(payload["content_type"]),
            last_modified=payload.get("last_modified"),
        )


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.gettempdir()) / "budgetkazpei-promo-products-tests"
        if self.temp_dir.exists():
            for child in self.temp_dir.iterdir():
                child.unlink()
            self.temp_dir.rmdir()
        self.settings = Settings.from_env().with_overrides(max_catalogs=1, max_pages=3)
        object.__setattr__(self.settings, "temp_dir", self.temp_dir)

        self.official_url = "https://www.e-leclerc.re/index.php/page/catalogues-reunion"
        self.viewer_url = "https://www.e-leclerc.re/public/catalogues/26runRDC"
        self.viewer_final_url = "https://www.e-leclerc.re/public/catalogues/26runRDC/"
        self.config_url = "https://www.e-leclerc.re/public/catalogues/26runRDC/javascript/config.js?v=1783601891210"
        self.page_1 = "https://www.e-leclerc.re/public/catalogues/26runRDC/files/large/page-001.webp"
        self.page_2 = "https://www.e-leclerc.re/public/catalogues/26runRDC/files/large/page-002.webp?cache=1"
        self.page_3 = "https://www.e-leclerc.re/public/catalogues/26runRDC/files/large/page-003.webp"

        official_html = (FIXTURES / "eleclerc_official_page.html").read_text(encoding="utf-8")
        viewer_html = (FIXTURES / "fliphtml5_viewer.html").read_text(encoding="utf-8")
        config_js = (FIXTURES / "fliphtml5_config.js").read_text(encoding="utf-8")
        self.fetcher = _FakeFetcher(
            {
                self.official_url: official_html,
                self.viewer_url: viewer_html,
                self.config_url: config_js,
                self.page_1: {
                    "sha256": "hash-page-1",
                    "size_bytes": 101,
                    "content_type": "image/webp",
                    "last_modified": "Tue, 28 Jul 2026 08:00:00 GMT",
                },
                self.page_2: {
                    "sha256": "hash-page-2",
                    "size_bytes": 102,
                    "content_type": "image/webp",
                    "last_modified": "Tue, 28 Jul 2026 08:01:00 GMT",
                },
                self.page_3: {
                    "sha256": "hash-page-3",
                    "size_bytes": 103,
                    "content_type": "image/webp",
                    "last_modified": "Tue, 28 Jul 2026 08:02:00 GMT",
                },
            }
        )

    def test_selects_only_26runrdc_and_discovers_five_catalogs(self):
        report = run(self.settings, fetcher=self.fetcher, repository=InMemoryPageSnapshotRepository())
        self.assertIsInstance(report, RunReport)
        self.assertEqual(len(report.detected_catalogs), 5)
        selected = [catalog.catalog_slug for catalog in report.detected_catalogs if catalog.selected]
        self.assertEqual(selected, ["26runRDC"])
        ignored = [catalog.catalog_slug for catalog in report.detected_catalogs if catalog.ignored_reason == "outside_mvp_target"]
        self.assertEqual(
            ignored,
            ["26run16-HYPER", "26run16-EXPRESS", "26run16-MAISON", "26run16-EC"],
        )

    def test_dry_run_hashes_three_pages_without_writing(self):
        repository = InMemoryPageSnapshotRepository()
        report = run(self.settings, fetcher=self.fetcher, repository=repository)
        self.assertEqual(report.written_page_snapshots, 0)
        self.assertEqual(len(repository.upserts), 0)
        self.assertEqual(len(report.processed_catalogs), 1)
        catalog = report.processed_catalogs[0]
        self.assertEqual(catalog.catalog_slug, "26runRDC")
        self.assertEqual(catalog.total_detected_pages, 3)
        self.assertEqual([page.decision for page in catalog.processed_pages], ["new", "new", "new"])
        self.assertEqual(len(self.fetcher.asset_fetches), 3)

    def test_unchanged_page_is_reported_without_real_write(self):
        repository = InMemoryPageSnapshotRepository(
            catalog_ids={("e-leclerc-reunion-catalogues", "e-leclerc-reunion-catalogues:26runrdc"): "catalog:1"}
        )
        first_report = run(self.settings, fetcher=self.fetcher, repository=repository)
        from app.services.page_fingerprint import PageSnapshotRecord
        from datetime import datetime, timezone

        seeded_at = datetime.now(timezone.utc)
        for processed in first_report.processed_catalogs[0].processed_pages:
            repository.page_snapshots[("catalog:1", processed.page_number)] = PageSnapshotRecord(
                catalog_id="catalog:1",
                page_number=processed.page_number,
                asset_url=processed.asset_url,
                asset_sha256=processed.asset_sha256,
                asset_content_type=processed.asset_content_type,
                asset_size_bytes=processed.asset_size_bytes,
                source_last_modified=processed.source_last_modified,
                extraction_status=processed.extraction_status,
                extraction_version="fliphtml5_pages_v1",
                first_seen_at=seeded_at,
                last_seen_at=seeded_at,
                extracted_at=None,
                purge_after=None,
            )
        repository.upserts.clear()
        second_report = run(self.settings, fetcher=self.fetcher, repository=repository)
        self.assertEqual([page.decision for page in second_report.processed_catalogs[0].processed_pages], ["unchanged", "unchanged", "unchanged"])
        self.assertEqual(len(repository.upserts), 0)

    def test_changed_page_is_marked_pending_extraction(self):
        repository = InMemoryPageSnapshotRepository(
            catalog_ids={("e-leclerc-reunion-catalogues", "e-leclerc-reunion-catalogues:26runrdc"): "catalog:1"}
        )
        first_report = run(self.settings, fetcher=self.fetcher, repository=repository)
        for snapshot in first_report.processed_catalogs[0].processed_pages:
            from app.services.page_fingerprint import PageSnapshotRecord
            from datetime import datetime, timezone

            repository.page_snapshots[("catalog:1", snapshot.page_number)] = PageSnapshotRecord(
                catalog_id="catalog:1",
                page_number=snapshot.page_number,
                asset_url=snapshot.asset_url,
                asset_sha256=snapshot.asset_sha256,
                asset_content_type=snapshot.asset_content_type,
                asset_size_bytes=snapshot.asset_size_bytes,
                source_last_modified=snapshot.source_last_modified,
                extraction_status=snapshot.extraction_status,
                extraction_version="fliphtml5_pages_v1",
                first_seen_at=datetime.now(timezone.utc),
                last_seen_at=datetime.now(timezone.utc),
                extracted_at=None,
                purge_after=None,
            )
        changed_fetcher = _FakeFetcher(dict(self.fetcher.url_map))
        changed_fetcher.url_map[self.page_2] = {
            "sha256": "hash-page-2-changed",
            "size_bytes": 202,
            "content_type": "image/webp",
            "last_modified": "Tue, 28 Jul 2026 09:00:00 GMT",
        }
        report = run(self.settings, fetcher=changed_fetcher, repository=repository)
        decisions = [page.decision for page in report.processed_catalogs[0].processed_pages]
        statuses = [page.extraction_status for page in report.processed_catalogs[0].processed_pages]
        self.assertEqual(decisions, ["unchanged", "changed", "unchanged"])
        self.assertEqual(statuses, ["unchanged", "pending_extraction", "unchanged"])

    def test_no_temporary_files_remain_after_run(self):
        report = run(self.settings, fetcher=self.fetcher, repository=InMemoryPageSnapshotRepository())
        self.assertEqual(report.temporary_files_remaining, 0)
        self.assertFalse(self.temp_dir.exists())


if __name__ == "__main__":
    unittest.main()
