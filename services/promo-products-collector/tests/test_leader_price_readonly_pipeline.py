from __future__ import annotations

import tempfile
from pathlib import Path
import unittest

from app.collectors.leader_price_reunion import run_leader_price_readonly
from app.main import TextDocument
from app.settings import Settings


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class _FakeFetcher:
    def __init__(self, text_map: dict[str, str]) -> None:
        self.text_map = text_map

    def fetch_text(self, url: str, *, allowed_hosts, settings) -> TextDocument:
        return TextDocument(url=url, content_type="text/html", text=self.text_map[url])


class LeaderPriceReadonlyPipelineTests(unittest.TestCase):
    def test_writes_readonly_reports_and_prefers_promotion_duplicates(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-leader-price-tests"
        if temp_root.exists():
            for item in sorted(temp_root.rglob("*"), reverse=True):
                if item.is_file():
                    item.unlink()
                elif item.is_dir():
                    item.rmdir()
        report_path = temp_root / "placeholder.json"

        settings = Settings.from_env().with_overrides(report_path=report_path)
        text_map = {
            "https://leaderdrive.re/": (FIXTURES / "leader_price_root.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage": (FIXTURES / "leader_price_store.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage/promotions": (FIXTURES / "leader_price_promotions.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage/articles/epicerie-salee": (FIXTURES / "leader_price_observed_category.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage/articles/jus-de-fruits-et-sirops": (FIXTURES / "leader_price_observed_category.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage/articles/cremerie": (FIXTURES / "leader_price_observed_category.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage/articles/hygiene-soins-du-corps": (FIXTURES / "leader_price_observed_category.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage/articles/produits-nettoyant": (FIXTURES / "leader_price_observed_category.html").read_text(encoding="utf-8"),
            "https://leaderdrive.re/leaderprice-lp-ermitage/articles/epicerie-salee/biscuits-fourres-gout-chocolat-noir-bio": (FIXTURES / "leader_price_product_detail.html").read_text(encoding="utf-8"),
        }
        report = run_leader_price_readonly(
            settings,
            fetcher=_FakeFetcher(text_map),
            max_products=12,
        )

        self.assertEqual(report.store.slug, "leaderprice-lp-ermitage")
        self.assertTrue(Path(report.report_path).is_file())
        self.assertTrue(Path(report.summary_path).is_file())
        self.assertGreaterEqual(report.deduplication.duplicates, 1)
        self.assertIn(report.classification, {"A", "B", "C"})
        self.assertEqual(report.external_cost_eur, 0.0)


if __name__ == "__main__":
    unittest.main()
