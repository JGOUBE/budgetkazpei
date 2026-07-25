import unittest

from app.collectors.registry import get_default_sources
from app.models.document import SourceDocument
from app.parsers.run_market_reunion import RunMarketReunionParser
from app.services.source_fingerprint import FingerprintExtractionError


RUN_MARKET_HTML = """
<html>
  <body>
    <div class="premium-carousel-template item-wrapper">
      <style>
        .promo-card > .overlay {
          background-image:url("https://www.run-market.re/wp-content/uploads/2026/07/OP7-3-CAROUSSEL-SITE-INTERNET-MAJ.png?cache=1");
        }
      </style>
      <div class="elementor-widget-container">
        <p>Du lundi 20 juillet au dimanche 2 aout 2026</p>
      </div>
      <div class="elementor-widget-container">
        <h1 class="elementor-heading-title">NOUVEAU CATALOGUE</h1>
      </div>
      <div class="elementor-widget-container">
        <p>Decouvrez sans plus attendre nos meilleures offres promotionnelles.</p>
      </div>
      <div class="elementor-button-wrapper">
        <a class="elementor-button elementor-button-link" href="https://runmarket.interactive-catalogue.com/petit-prix-20-juillet-au-2-aout-2026/?page=1&utm_source=fb" target="_blank">
          <span class="elementor-button-text">Consultez maintenant</span>
        </a>
      </div>
    </div>
  </body>
</html>
"""


def _make_document(source, html_text: str) -> SourceDocument:
    return SourceDocument(
        source_slug=source.slug,
        source_url=source.source_url,
        final_url=source.source_url,
        content_type="text/html",
        http_status=200,
        content_bytes=html_text.encode("utf-8"),
        extracted_text=html_text,
        sha256="raw-hash",
    )


class RunMarketParserTests(unittest.TestCase):
    def setUp(self):
        self.source = next(source for source in get_default_sources() if source.slug == "run-market-reunion-home")
        self.parser = RunMarketReunionParser()

    def test_parser_extracts_real_catalog_entry(self):
        candidates = self.parser.parse(self.source, _make_document(self.source, RUN_MARKET_HTML))
        self.assertEqual(len(candidates), 1)
        candidate = candidates[0]
        self.assertEqual(candidate.title, "NOUVEAU CATALOGUE")
        self.assertEqual(candidate.source_url, "https://runmarket.interactive-catalogue.com/petit-prix-20-juillet-au-2-aout-2026?page=1")
        self.assertEqual(candidate.starts_at.year, 2026)
        self.assertEqual(candidate.ends_at.day, 2)
        self.assertEqual(candidate.retailer_slug, "run-market-reunion")

    def test_parser_fails_when_no_catalog_exists(self):
        with self.assertRaises(FingerprintExtractionError):
            self.parser.parse(self.source, _make_document(self.source, "<html><body><p>Accueil</p></body></html>"))


if __name__ == "__main__":
    unittest.main()
