from pathlib import Path
import unittest

from app.collectors.eleclerc_reunion import discover_catalogs
from app.settings import Settings


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class EleclercCatalogDiscoveryTests(unittest.TestCase):
    def test_detects_five_catalogs(self):
        html_text = (FIXTURES / "eleclerc_official_page.html").read_text(encoding="utf-8")
        catalogs = discover_catalogs(
            html_text,
            "https://www.e-leclerc.re/index.php/page/catalogues-reunion",
            "e-leclerc.re",
        )
        self.assertEqual([catalog.catalog_slug for catalog in catalogs], [
            "26runRDC",
            "26run16-HYPER",
            "26run16-EXPRESS",
            "26run16-MAISON",
            "26run16-EC",
        ])

    def test_settings_target_is_26runrdc_by_default(self):
        settings = Settings.from_env()
        self.assertEqual(settings.target_catalog_slug, "26runRDC")


if __name__ == "__main__":
    unittest.main()
