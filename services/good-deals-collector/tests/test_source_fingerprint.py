import unittest

from app.collectors.registry import get_default_sources
from app.models.document import SourceDocument
from app.services.hashing import sha256_text
from app.services.source_fingerprint import FingerprintExtractionError, build_source_fingerprint


CARREFOUR_HTML_A = """
<html>
  <head>
    <meta name="csrf-token" content="nonce-a">
    <script>window.dynamic="a";</script>
  </head>
  <body>
    <div class="catalogs">
      <div class="catalog">
        <picture>
          <img src="/img/catalog-1.jpg?cache=111&utm_source=fb" alt="Carrefour">
        </picture>
        <div class="title">Les prix gagnants</div>
        <div class="subtitle">Du lundi 13 juillet au dimanche 26 juillet 2026</div>
        <div class="link">
          <a href="https://www.carrefour-reunion.com/catalogues/carrefour/644-les-prix-gagnants?utm_source=fb"
             data-flipping-book="https://www.carrefour-reunion.com/catalogues/carrefour/644.json?cache=1"
             data-flipping-book-id="644"
             data-brand="carrefour">Consultez</a>
        </div>
      </div>
      <div class="catalog">
        <picture>
          <img src="/img/catalog-2.jpg?cache=999" alt="Carrefour Market">
        </picture>
        <div class="title">Cuisine d'hiver</div>
        <div class="subtitle">Du lundi 27 juillet au dimanche 9 aout 2026</div>
        <div class="link">
          <a href="https://www.carrefour-reunion.com/catalogues/carrefour/645-cuisine-d-hiver?gclid=abc"
             data-flipping-book="https://www.carrefour-reunion.com/catalogues/carrefour/645.json?nonce=xyz"
             data-flipping-book-id="645"
             data-brand="market">Consultez</a>
        </div>
      </div>
    </div>
  </body>
</html>
"""

CARREFOUR_HTML_B = """
<html>
  <head>
    <meta name="csrf-token" content="nonce-b">
    <script>window.dynamic="b";</script>
  </head>
  <body>
    <div class="catalogs">
      <div class="catalog">
        <picture>
          <img src="/img/catalog-2.jpg?cache=123456" alt="Carrefour Market">
        </picture>
        <div class="title">Cuisine d'hiver</div>
        <div class="subtitle">Du lundi 27 juillet au dimanche 9 aout 2026</div>
        <div class="link">
          <a href="https://www.carrefour-reunion.com/catalogues/carrefour/645-cuisine-d-hiver?utm_medium=social"
             data-flipping-book="https://www.carrefour-reunion.com/catalogues/carrefour/645.json?cache=2"
             data-flipping-book-id="645"
             data-brand="market">Consultez</a>
        </div>
      </div>
      <div class="catalog">
        <picture>
          <img src="/img/catalog-1.jpg?cache=222&utm_campaign=summer" alt="Carrefour">
        </picture>
        <div class="title">Les prix gagnants</div>
        <div class="subtitle">Du lundi 13 juillet au dimanche 26 juillet 2026</div>
        <div class="link">
          <a href="https://www.carrefour-reunion.com/catalogues/carrefour/644-les-prix-gagnants?fbclid=123"
             data-flipping-book="https://www.carrefour-reunion.com/catalogues/carrefour/644.json?cache=3"
             data-flipping-book-id="644"
             data-brand="carrefour">Consultez</a>
        </div>
      </div>
    </div>
  </body>
</html>
"""

AUCHAN_HTML_A = """
<html>
  <body>
    <div class="bg-white rounded-xl p-2">
      <div class="home-cat-item-imgrounded-lg">
        <img src="/images/catalogs/a.png?cache=1" alt="">
      </div>
      <div class="p-2">
        <div>
          <div class="home-cat-item-infos-title line-clamp-1">
            <h2 class="fw-black">Le Pack</h2>
          </div>
          <div class="text-sm text-black/50">Du 14/07/2026 au 26/07/2026</div>
        </div>
        <div class="w-full flex flex-row justify-end">
          <a href="https://www.auchansaintlouis.com/catalogues/uuid-1?utm_source=fb" class="a-link">Consulter</a>
        </div>
      </div>
    </div>
    <div class="bg-white rounded-xl p-2">
      <div class="home-cat-item-imgrounded-lg">
        <img src="/images/catalogs/b.png?cache=2" alt="">
      </div>
      <div class="p-2">
        <div>
          <div class="home-cat-item-infos-title line-clamp-1">
            <h2 class="fw-black">Defis rentree</h2>
          </div>
          <div class="text-sm text-black/50">Du 14/07/2026 au 26/07/2026</div>
        </div>
        <div class="w-full flex flex-row justify-end">
          <a href="https://www.auchansaintlouis.com/catalogues/uuid-2?cache=9" class="a-link">Consulter</a>
        </div>
      </div>
    </div>
  </body>
</html>
"""

AUCHAN_HTML_B = """
<html>
  <body>
    <script>window.sessionToken="abc";</script>
    <div class="bg-white rounded-xl p-2">
      <div class="home-cat-item-imgrounded-lg">
        <img src="/images/catalogs/b.png?cache=999&utm_campaign=promo" alt="">
      </div>
      <div class="p-2">
        <div>
          <div class="home-cat-item-infos-title line-clamp-1">
            <h2 class="fw-black">Defis rentree</h2>
          </div>
          <div class="text-sm text-black/50">Du 14/07/2026 au 26/07/2026</div>
        </div>
        <div class="w-full flex flex-row justify-end">
          <a href="https://www.auchansaintlouis.com/catalogues/uuid-2?fbclid=abc" class="a-link">Consulter</a>
        </div>
      </div>
    </div>
    <div class="bg-white rounded-xl p-2">
      <div class="home-cat-item-imgrounded-lg">
        <img src="/images/catalogs/a.png?cache=555" alt="">
      </div>
      <div class="p-2">
        <div>
          <div class="home-cat-item-infos-title line-clamp-1">
            <h2 class="fw-black">Le Pack</h2>
          </div>
          <div class="text-sm text-black/50">Du 14/07/2026 au 26/07/2026</div>
        </div>
        <div class="w-full flex flex-row justify-end">
          <a href="https://www.auchansaintlouis.com/catalogues/uuid-1?utm_medium=social" class="a-link">Consulter</a>
        </div>
      </div>
    </div>
  </body>
</html>
"""

ELECLERC_HTML_A = """
<html>
  <body>
    <ul class="dropdown-menu" role="menu">
      <li><a href="/public/catalogues/26runRDC?utm_source=mail" target="_blank"
            title="Catalogue E.Leclerc Reunion. Rentree des classes. Du 7 Juillet Au 2 Aout 2026.">Rentree des classes</a></li>
      <li><a href="/public/catalogues/26run15-HYPER" target="_blank"
            title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (HYPER). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (HYPER)</a></li>
      <li><a href="/public/catalogues/26run15-EXPRESS" target="_blank"
            title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (EXPRESS). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (EXPRESS)</a></li>
      <li><a href="/public/catalogues/26run15-MAISON?cache=1" target="_blank"
            title="Catalogue E.Leclerc Reunion. Special Espace Maison Electromenager Technologie (MAISON). Du 14 Juillet Au 28 Juillet 2026.">Special Espace Maison Electromenager Technologie (MAISON)</a></li>
      <li><a href="/public/catalogues/26run15-EC" target="_blank"
            title="Catalogue E.Leclerc Reunion. Rentree des classes: le bon eleve des petits prix (ESPACE CULTUREL). Du 14 Juillet Au 26 Juillet 2026.">Rentree des classes: le bon eleve des petits prix (ESPACE CULTUREL)</a></li>
      <!-- <li><a href="http://e-leclerc.re/public/catalogues/LECLERCOP17/OLD" target="_blank"
            title="Catalogue E.Leclerc Reunion. Archive. Du 25 Juillet au 6 Aout 2017.">Archive</a></li> -->
    </ul>
  </body>
</html>
"""

ELECLERC_HTML_B = """
<html>
  <body>
    <script>window.token="rotating";</script>
    <ul class="dropdown-menu" role="menu">
      <li><a href="/public/catalogues/26run15-EC?cache=2" target="_blank"
            title="Catalogue E.Leclerc Reunion. Rentree des classes: le bon eleve des petits prix (ESPACE CULTUREL). Du 14 Juillet Au 26 Juillet 2026.">Rentree des classes: le bon eleve des petits prix (ESPACE CULTUREL)</a></li>
      <li><a href="/public/catalogues/26run15-MAISON?cache=9&utm_campaign=promo" target="_blank"
            title="Catalogue E.Leclerc Reunion. Special Espace Maison Electromenager Technologie (MAISON). Du 14 Juillet Au 28 Juillet 2026.">Special Espace Maison Electromenager Technologie (MAISON)</a></li>
      <li><a href="/public/catalogues/26run15-EXPRESS?fbclid=123" target="_blank"
            title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (EXPRESS). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (EXPRESS)</a></li>
      <li><a href="/public/catalogues/26run15-HYPER?cache=3" target="_blank"
            title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (HYPER). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (HYPER)</a></li>
      <li><a href="/public/catalogues/26runRDC?utm_medium=social" target="_blank"
            title="Catalogue E.Leclerc Reunion. Rentree des classes. Du 7 Juillet Au 2 Aout 2026.">Rentree des classes</a></li>
    </ul>
  </body>
</html>
"""

RUN_MARKET_HTML_A = """
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

RUN_MARKET_HTML_B = """
<html>
  <body>
    <script>window.nonce="abc";</script>
    <section class="mobile-variant">
      <div class="elementor-widget-container">
        <h1 class="elementor-heading-title">NOUVEAU CATALOGUE</h1>
      </div>
      <div class="elementor-widget-container">
        <p>Du lundi 20 juillet au dimanche 2 aout 2026</p>
      </div>
      <div class="elementor-widget-container">
        <p>Decouvrez sans plus attendre nos meilleures offres promotionnelles.</p>
      </div>
      <img src="https://www.run-market.re/wp-content/uploads/2026/07/OP7-3-CAROUSSEL-SITE-INTERNET-MAJ.png?cache=9&fbclid=123" alt="">
      <div class="elementor-button-wrapper">
        <a class="elementor-button elementor-button-link" href="https://runmarket.interactive-catalogue.com/petit-prix-20-juillet-au-2-aout-2026/?page=1&cache=2" target="_blank">
          <span class="elementor-button-text">Consultez maintenant</span>
        </a>
      </div>
    </section>
  </body>
</html>
"""

RUN_MARKET_HTML_REORDERED = """
<html>
  <body>
    <section class="mobile-variant">
      <img src="https://www.run-market.re/wp-content/uploads/2026/07/OP7-3-CAROUSSEL-SITE-INTERNET-MAJ.png?cache=11" alt="">
      <div class="elementor-widget-container">
        <p>Decouvrez sans plus attendre nos meilleures offres promotionnelles.</p>
      </div>
      <div class="elementor-button-wrapper">
        <a class="elementor-button elementor-button-link" href="https://runmarket.interactive-catalogue.com/petit-prix-20-juillet-au-2-aout-2026/?page=1&gclid=x" target="_blank">
          <span class="elementor-button-text">Consultez maintenant</span>
        </a>
      </div>
      <div class="elementor-widget-container">
        <p>Du lundi 20 juillet au dimanche 2 aout 2026</p>
      </div>
      <div class="elementor-widget-container">
        <h1 class="elementor-heading-title">NOUVEAU CATALOGUE</h1>
      </div>
    </section>
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
        sha256=sha256_text(html_text),
    )


class SourceFingerprintTests(unittest.TestCase):
    def setUp(self):
        self.sources = {source.slug: source for source in get_default_sources()}

    def test_carrefour_fingerprint_ignores_dynamic_noise(self):
        source = self.sources["carrefour-reunion-catalogues"]
        left = build_source_fingerprint(source, _make_document(source, CARREFOUR_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, CARREFOUR_HTML_B))
        self.assertEqual(left.sha256, right.sha256)

    def test_carrefour_fingerprint_changes_when_catalog_added(self):
        source = self.sources["carrefour-reunion-catalogues"]
        changed_html = CARREFOUR_HTML_A.replace(
            "</div>\n    </div>",
            """
      <div class="catalog">
        <picture><img src="/img/catalog-3.jpg" alt="Market"></picture>
        <div class="title">Nouveau catalogue</div>
        <div class="subtitle">Du lundi 1 septembre au dimanche 14 septembre 2026</div>
        <div class="link"><a href="https://www.carrefour-reunion.com/catalogues/carrefour/700-nouveau"
            data-flipping-book-id="700" data-brand="market">Consultez</a></div>
      </div>
    </div>
""",
            1,
        )
        left = build_source_fingerprint(source, _make_document(source, CARREFOUR_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_carrefour_fingerprint_changes_when_period_changes(self):
        source = self.sources["carrefour-reunion-catalogues"]
        changed_html = CARREFOUR_HTML_A.replace("26 juillet 2026", "27 juillet 2026", 1)
        left = build_source_fingerprint(source, _make_document(source, CARREFOUR_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_carrefour_fingerprint_fails_when_no_cards(self):
        source = self.sources["carrefour-reunion-catalogues"]
        with self.assertRaises(FingerprintExtractionError):
            build_source_fingerprint(source, _make_document(source, "<html><body><script>dynamic</script></body></html>"))

    def test_auchan_fingerprint_ignores_image_and_tracking_noise(self):
        source = self.sources["auchan-saint-louis-catalogues"]
        left = build_source_fingerprint(source, _make_document(source, AUCHAN_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, AUCHAN_HTML_B))
        self.assertEqual(left.sha256, right.sha256)

    def test_auchan_fingerprint_changes_when_catalog_added(self):
        source = self.sources["auchan-saint-louis-catalogues"]
        changed_html = AUCHAN_HTML_A.replace(
            "</body>",
            """
    <div class="bg-white rounded-xl p-2">
      <div class="home-cat-item-imgrounded-lg"><img src="/images/catalogs/c.png" alt=""></div>
      <div class="p-2">
        <div><div class="home-cat-item-infos-title line-clamp-1"><h2 class="fw-black">Cuisine maline</h2></div>
        <div class="text-sm text-black/50">Du 28/07/2026 au 09/08/2026</div></div>
        <div class="w-full flex flex-row justify-end"><a href="https://www.auchansaintlouis.com/catalogues/uuid-3" class="a-link">Consulter</a></div>
      </div>
    </div>
  </body>
""",
            1,
        )
        left = build_source_fingerprint(source, _make_document(source, AUCHAN_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_auchan_fingerprint_changes_when_period_changes(self):
        source = self.sources["auchan-saint-louis-catalogues"]
        changed_html = AUCHAN_HTML_A.replace("26/07/2026", "27/07/2026", 1)
        left = build_source_fingerprint(source, _make_document(source, AUCHAN_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_auchan_fingerprint_fails_when_no_cards(self):
        source = self.sources["auchan-saint-louis-catalogues"]
        with self.assertRaises(FingerprintExtractionError):
            build_source_fingerprint(source, _make_document(source, "<html><body><div>empty</div></body></html>"))

    def test_eleclerc_fingerprint_ignores_order_and_tracking_noise(self):
        source = self.sources["e-leclerc-reunion-catalogues"]
        left = build_source_fingerprint(source, _make_document(source, ELECLERC_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, ELECLERC_HTML_B))
        self.assertEqual(left.sha256, right.sha256)

    def test_eleclerc_fingerprint_changes_when_catalog_added(self):
        source = self.sources["e-leclerc-reunion-catalogues"]
        changed_html = ELECLERC_HTML_A.replace(
            "</ul>",
            '<li><a href="/public/catalogues/26runNOUVEAU" target="_blank" title="Catalogue E.Leclerc Reunion. Nouveaute locale. Du 1 Aout Au 15 Aout 2026.">Nouveaute locale</a></li></ul>',
            1,
        )
        left = build_source_fingerprint(source, _make_document(source, ELECLERC_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_eleclerc_fingerprint_changes_when_period_changes(self):
        source = self.sources["e-leclerc-reunion-catalogues"]
        changed_html = ELECLERC_HTML_A.replace("Du 14 Juillet Au 28 Juillet 2026.", "Du 14 Juillet Au 29 Juillet 2026.", 1)
        left = build_source_fingerprint(source, _make_document(source, ELECLERC_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_run_market_fingerprint_ignores_script_noise(self):
        source = self.sources["run-market-reunion-home"]
        left = build_source_fingerprint(source, _make_document(source, RUN_MARKET_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, RUN_MARKET_HTML_B))
        self.assertEqual(left.sha256, right.sha256)

    def test_run_market_fingerprint_ignores_tracking_and_order_noise(self):
        source = self.sources["run-market-reunion-home"]
        left = build_source_fingerprint(source, _make_document(source, RUN_MARKET_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, RUN_MARKET_HTML_REORDERED))
        self.assertEqual(left.sha256, right.sha256)

    def test_run_market_fingerprint_changes_when_catalog_added(self):
        source = self.sources["run-market-reunion-home"]
        changed_html = RUN_MARKET_HTML_A.replace(
            "</body>",
            """
    <div class="premium-carousel-template item-wrapper">
      <div class="elementor-widget-container"><p>Du lundi 3 aout au dimanche 17 aout 2026</p></div>
      <div class="elementor-widget-container"><h1 class="elementor-heading-title">NOUVEAU CATALOGUE</h1></div>
      <div class="elementor-widget-container"><p>Operation locale supplementaire.</p></div>
      <div class="elementor-button-wrapper"><a class="elementor-button elementor-button-link" href="https://runmarket.interactive-catalogue.com/famille-du-3-aout-au-17-aout-2026/?page=1" target="_blank"><span class="elementor-button-text">Consultez maintenant</span></a></div>
    </div>
  </body>
""",
            1,
        )
        left = build_source_fingerprint(source, _make_document(source, RUN_MARKET_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_run_market_fingerprint_changes_when_period_changes(self):
        source = self.sources["run-market-reunion-home"]
        changed_html = RUN_MARKET_HTML_A.replace("2 aout 2026", "3 aout 2026", 1)
        left = build_source_fingerprint(source, _make_document(source, RUN_MARKET_HTML_A))
        right = build_source_fingerprint(source, _make_document(source, changed_html))
        self.assertNotEqual(left.sha256, right.sha256)

    def test_run_market_fingerprint_changes_when_catalog_removed(self):
        source = self.sources["run-market-reunion-home"]
        left = build_source_fingerprint(source, _make_document(source, RUN_MARKET_HTML_A))
        with self.assertRaises(FingerprintExtractionError):
            build_source_fingerprint(source, _make_document(source, "<html><body></body></html>"))
        self.assertIsNotNone(left.sha256)

    def test_run_market_fingerprint_fails_when_no_catalog_detected(self):
        source = self.sources["run-market-reunion-home"]
        with self.assertRaises(FingerprintExtractionError):
            build_source_fingerprint(source, _make_document(source, "<html><body><script>rotating</script></body></html>"))


if __name__ == "__main__":
    unittest.main()
