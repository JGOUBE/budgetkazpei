from pathlib import Path
import unittest

from app.extractors.fliphtml5_pages import discover_viewer, extract_page_assets


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class FlipHtml5PagesTests(unittest.TestCase):
    def test_finds_config_js_on_viewer_page(self):
        viewer_html = (FIXTURES / "fliphtml5_viewer.html").read_text(encoding="utf-8")
        viewer = discover_viewer(
            viewer_html,
            "https://www.e-leclerc.re/public/catalogues/26runRDC/",
            {"e-leclerc.re", "www.e-leclerc.re"},
        )
        self.assertEqual(
            viewer.config_url,
            "https://www.e-leclerc.re/public/catalogues/26runRDC/javascript/config.js?v=1783601891210",
        )

    def test_extracts_ordered_page_urls_without_duplicates_and_rejects_out_of_domain(self):
        config_js = (FIXTURES / "fliphtml5_config.js").read_text(encoding="utf-8")
        pages = extract_page_assets(
            config_js,
            "https://www.e-leclerc.re/public/catalogues/26runRDC/javascript/config.js?v=1783601891210",
            {"e-leclerc.re", "www.e-leclerc.re"},
        )
        self.assertEqual(
            [page.asset_url for page in pages],
            [
                "https://www.e-leclerc.re/public/catalogues/26runRDC/files/large/page-001.webp",
                "https://www.e-leclerc.re/public/catalogues/26runRDC/files/large/page-002.webp?cache=1",
                "https://www.e-leclerc.re/public/catalogues/26runRDC/files/large/page-003.webp",
            ],
        )
        self.assertEqual([page.page_number for page in pages], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
