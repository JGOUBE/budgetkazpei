import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.collectors.registry import get_default_sources
from app.config import Settings
from app.db.repositories import DryRunRepositories, InMemoryRepositories
from app.main import run
from app.models.candidate import Candidate
from app.models.document import SourceDocument
from app.services.hashing import sha256_text
from app.models.source import SourceDefinition


class _FailingCollector:
    def collect(self, source, settings):
        raise RuntimeError("network blocked")


class _StaticCollector:
    def collect(self, source, settings):
        return SourceDocument(
            source_slug=source.slug,
            source_url=source.source_url,
            final_url=source.source_url,
            content_type="text/html",
            http_status=200,
            content_bytes=b"<html></html>",
            extracted_text="Promo du 1 juillet au 15 juillet 2026 Cafe 3,99 € au lieu de 4,99 €",
            sha256="abc123",
        )


class _HtmlSequenceCollector:
    def __init__(self, html_pages):
        self.html_pages = list(html_pages)
        self.index = 0

    def collect(self, source, settings):
        html_text = self.html_pages[min(self.index, len(self.html_pages) - 1)]
        self.index += 1
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


class _StaticParser:
    def __init__(self):
        self.calls = 0

    def parse(self, source, document):
        self.calls += 1
        return [
            Candidate(
                source_slug=source.slug,
                external_key="fixture:1",
                content_family=source.content_family,
                content_kind="promotion",
                title="Cafe 3,99 EUR",
                description="Cafe promo",
                source_url=source.source_url,
                scope_type="island",
                business_name="Source test",
                retailer_slug="source-test",
                product_name="Cafe",
                normalized_product_name="cafe",
                category="shopping",
                promo_price=3.99,
            )
        ]


class _StaticFingerprint(SimpleNamespace):
    pass


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings.from_env().with_overrides(collector_mode="dry-run", collector_dry_run=True, collector_max_sources=1)

    @staticmethod
    def _supported_shopping_sources():
        return [
            SourceDefinition(
                slug="carrefour-reunion-catalogues",
                name="Carrefour Reunion catalogues",
                content_family="shopping",
                source_type="html",
                source_url="https://www.carrefour-reunion.com/catalogues/carrefour",
                official_domain="carrefour-reunion.com",
                parser_key="carrefour_reunion",
                scope_type="island",
                retailer_slug="carrefour-reunion",
            ),
            SourceDefinition(
                slug="magasins-u-reunion-home",
                name="Magasins U Reunion",
                content_family="shopping",
                source_type="html",
                source_url="https://www.magasins-u.re/",
                official_domain="magasins-u.re",
                parser_key="magasins_u_reunion",
                scope_type="island",
                retailer_slug="magasins-u-reunion",
            ),
            SourceDefinition(
                slug="run-market-reunion-home",
                name="Run Market Reunion",
                content_family="shopping",
                source_type="html",
                source_url="https://www.run-market.re/",
                official_domain="run-market.re",
                parser_key="run_market_reunion",
                scope_type="island",
                retailer_slug="run-market-reunion",
            ),
            SourceDefinition(
                slug="auchan-saint-louis-catalogues",
                name="Auchan Saint-Louis catalogues",
                content_family="shopping",
                source_type="html",
                source_url="https://www.auchansaintlouis.com/les-catalogues",
                official_domain="auchansaintlouis.com",
                parser_key="auchan_saint_louis",
                scope_type="commune",
                retailer_slug="auchan-saint-louis",
                commune="Saint-Louis",
            ),
            SourceDefinition(
                slug="e-leclerc-reunion-catalogues",
                name="E.Leclerc Reunion catalogues",
                content_family="shopping",
                source_type="html",
                source_url="https://www.e-leclerc.re/index.php/page/catalogues-reunion",
                official_domain="e-leclerc.re",
                parser_key="eleclerc_reunion",
                scope_type="island",
                retailer_slug="eleclerc-reunion",
                is_active=True,
            ),
        ]

    @staticmethod
    def _fingerprint_for(source):
        return _StaticFingerprint(
            sha256=f"fingerprint:{source.slug}",
            strategy="test_selection",
            catalog_count=1,
            semantic_items_count=1,
        )

    def test_source_error_does_not_abort_whole_run(self):
        source = SourceDefinition(
            slug="failing-source",
            name="Failing source",
            content_family="shopping",
            source_type="html",
            source_url="https://example.com",
            official_domain="example.com",
            parser_key="generic_catalog",
            scope_type="island",
        )
        with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": _FailingCollector()}):
            summary = run(self.settings)

        self.assertEqual(summary.status, "completed_with_errors")
        self.assertEqual(summary.sources_checked, 1)
        self.assertEqual(summary.errors_count, 1)

    def test_zero_source_dry_run_is_valid_smoke(self):
        summary = run(self.settings.with_overrides(collector_max_sources=0))
        self.assertEqual(summary.status, "completed")
        self.assertEqual(summary.sources_total, 0)
        self.assertEqual(summary.sources_checked, 0)

    def test_dry_run_detects_candidates_without_publishing(self):
        source = SourceDefinition(
            slug="static-source",
            name="Static source",
            content_family="shopping",
            source_type="html",
            source_url="https://example.com",
            official_domain="example.com",
            parser_key="static",
            scope_type="island",
        )
        repositories = InMemoryRepositories()
        parser = _StaticParser()
        with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": _StaticCollector()}), patch("app.main.get_parsers", return_value={"static": parser}), patch("app.main.get_repository", return_value=repositories):
            summary = run(self.settings)

        self.assertEqual(summary.candidates_detected, 1)
        self.assertEqual(summary.candidates_published, 0)
        self.assertEqual(len(repositories.good_deals), 0)
        self.assertEqual(len(repositories.catalogs), 0)
        self.assertEqual(len(repositories.promotions), 0)

    def test_eleclerc_source_is_active_in_default_registry(self):
        eleclerc = next(source for source in get_default_sources() if source.slug == "e-leclerc-reunion-catalogues")
        self.assertEqual(eleclerc.parser_key, "eleclerc_reunion")
        self.assertTrue(eleclerc.is_active)

    def test_five_active_supported_shopping_sources_with_max_five_selects_five(self):
        sources = self._supported_shopping_sources()
        parser = _StaticParser()
        settings = self.settings.with_overrides(collector_mode="shopping", collector_max_sources=5)

        with patch("app.main.get_default_sources", return_value=sources), patch("app.main.get_collectors", return_value={"html": _StaticCollector()}), patch("app.main.get_parsers", return_value={source.parser_key: parser for source in sources}), patch("app.main.get_repository", return_value=InMemoryRepositories()), patch("app.main.build_source_fingerprint", side_effect=lambda source, document: self._fingerprint_for(source)), patch("app.main.LOGGER.info") as logger_info:
            summary = run(settings, requested_max_sources=5)

        self.assertEqual(summary.sources_checked, 5)
        selection_call = next(call for call in logger_info.call_args_list if call.args and call.args[0] == "Selected collector sources")
        self.assertEqual(selection_call.kwargs["extra"]["requested_max_sources"], 5)
        self.assertEqual(selection_call.kwargs["extra"]["effective_max_sources"], 5)
        self.assertEqual(selection_call.kwargs["extra"]["available_sources_count"], 5)
        self.assertEqual(selection_call.kwargs["extra"]["selected_sources_count"], 5)
        self.assertEqual(
            selection_call.kwargs["extra"]["selected_source_slugs"],
            [
                "carrefour-reunion-catalogues",
                "magasins-u-reunion-home",
                "run-market-reunion-home",
                "auchan-saint-louis-catalogues",
                "e-leclerc-reunion-catalogues",
            ],
        )

    def test_cli_max_sources_overrides_env_max_sources(self):
        sources = self._supported_shopping_sources()
        parser = _StaticParser()
        with patch.dict("os.environ", {"COLLECTOR_MAX_SOURCES": "4"}, clear=False):
            settings = Settings.from_env().with_overrides(collector_mode="shopping", collector_dry_run=True, collector_max_sources=5)
        with patch("app.main.get_default_sources", return_value=sources), patch("app.main.get_collectors", return_value={"html": _StaticCollector()}), patch("app.main.get_parsers", return_value={source.parser_key: parser for source in sources}), patch("app.main.get_repository", return_value=InMemoryRepositories()), patch("app.main.build_source_fingerprint", side_effect=lambda source, document: self._fingerprint_for(source)):
            summary = run(settings, requested_max_sources=5)

        self.assertEqual(summary.sources_checked, 5)

    def test_env_max_sources_is_used_when_cli_is_absent(self):
        sources = self._supported_shopping_sources()
        parser = _StaticParser()
        with patch.dict("os.environ", {"COLLECTOR_MAX_SOURCES": "4"}, clear=False):
            settings = Settings.from_env().with_overrides(collector_mode="shopping", collector_dry_run=True)
        with patch("app.main.get_default_sources", return_value=sources), patch("app.main.get_collectors", return_value={"html": _StaticCollector()}), patch("app.main.get_parsers", return_value={source.parser_key: parser for source in sources}), patch("app.main.get_repository", return_value=InMemoryRepositories()), patch("app.main.build_source_fingerprint", side_effect=lambda source, document: self._fingerprint_for(source)):
            summary = run(settings)

        self.assertEqual(summary.sources_checked, 4)

    def test_first_dry_run_records_run_and_snapshot(self):
        source = SourceDefinition(
            slug="static-source",
            name="Static source",
            content_family="shopping",
            source_type="html",
            source_url="https://example.com",
            official_domain="example.com",
            parser_key="static",
            scope_type="island",
        )
        technical = InMemoryRepositories()
        parser = _StaticParser()
        repository = DryRunRepositories(technical)

        with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": _StaticCollector()}), patch("app.main.get_parsers", return_value={"static": parser}), patch("app.main.get_repository", return_value=repository):
            summary = run(self.settings)

        self.assertEqual(summary.sources_changed, 1)
        self.assertEqual(summary.candidates_detected, 1)
        self.assertEqual(len(technical.runs), 1)
        self.assertEqual(len(technical.snapshots), 1)
        first_snapshot = next(iter(technical.snapshots.values()))
        self.assertTrue(first_snapshot["changed"])
        self.assertEqual(first_snapshot["status"], "parsed")
        self.assertEqual(len(technical.good_deals), 0)
        self.assertEqual(len(technical.catalogs), 0)
        self.assertEqual(len(technical.promotions), 0)

    def test_second_dry_run_with_same_content_records_unchanged_snapshot_and_skips_parser(self):
        source = SourceDefinition(
            slug="static-source",
            name="Static source",
            content_family="shopping",
            source_type="html",
            source_url="https://example.com",
            official_domain="example.com",
            parser_key="static",
            scope_type="island",
        )
        technical = InMemoryRepositories()
        parser = _StaticParser()

        with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": _StaticCollector()}), patch("app.main.get_parsers", return_value={"static": parser}), patch("app.main.get_repository", side_effect=[DryRunRepositories(technical), DryRunRepositories(technical)]):
            first_summary = run(self.settings)
            second_summary = run(self.settings)

        self.assertEqual(first_summary.sources_changed, 1)
        self.assertEqual(second_summary.sources_changed, 0)
        self.assertEqual(second_summary.candidates_detected, 0)
        self.assertEqual(parser.calls, 1)
        self.assertEqual(len(technical.runs), 2)
        self.assertEqual(len(technical.snapshots), 2)
        latest_snapshot = list(technical.snapshots.values())[-1]
        self.assertFalse(latest_snapshot["changed"])
        self.assertEqual(latest_snapshot["status"], "skipped_unchanged")

    def test_error_snapshot_is_recorded_and_other_sources_continue_in_dry_run(self):
        sources = [
            SourceDefinition(
                slug="failing-source",
                name="Failing source",
                content_family="shopping",
                source_type="html",
                source_url="https://example.com/fail",
                official_domain="example.com",
                parser_key="generic_catalog",
                scope_type="island",
            ),
            SourceDefinition(
                slug="static-source",
                name="Static source",
                content_family="shopping",
                source_type="html",
                source_url="https://example.com/ok",
                official_domain="example.com",
                parser_key="static",
                scope_type="island",
            ),
        ]

        class MixedCollector:
            def collect(self, source, settings):
                if source.slug == "failing-source":
                    raise RuntimeError("network blocked")
                return _StaticCollector().collect(source, settings)

        technical = InMemoryRepositories()
        parser = _StaticParser()
        repository = DryRunRepositories(technical)

        with patch("app.main.get_default_sources", return_value=sources), patch("app.main.get_collectors", return_value={"html": MixedCollector()}), patch("app.main.get_parsers", return_value={"generic_catalog": parser, "static": parser}), patch("app.main.get_repository", return_value=repository):
            summary = run(self.settings.with_overrides(collector_max_sources=2))

        self.assertEqual(summary.sources_checked, 2)
        self.assertEqual(summary.errors_count, 1)
        self.assertEqual(len(technical.snapshots), 2)
        snapshot_statuses = [snapshot["status"] for snapshot in technical.snapshots.values()]
        self.assertIn("failed", snapshot_statuses)
        self.assertIn("parsed", snapshot_statuses)

    def test_carrefour_semantic_fingerprint_skips_unchanged_second_pass(self):
        source = SourceDefinition(
            slug="carrefour-reunion-catalogues",
            name="Carrefour Reunion catalogues",
            content_family="shopping",
            source_type="html",
            source_url="https://www.carrefour-reunion.com/catalogues/carrefour",
            official_domain="carrefour-reunion.com",
            parser_key="carrefour_reunion",
            scope_type="island",
            retailer_slug="carrefour-reunion",
        )
        html_pages = [
            """
            <html><head><meta name="csrf-token" content="a"></head><body>
              <div class="catalog"><picture><img src="/img/a.jpg?cache=1"></picture><div class="title">Les prix gagnants</div>
              <div class="subtitle">Du lundi 13 juillet au dimanche 26 juillet 2026</div>
              <div class="link"><a href="https://www.carrefour-reunion.com/catalogues/carrefour/644-les-prix-gagnants?utm_source=x"
                data-flipping-book-id="644" data-brand="carrefour">Consultez</a></div></div>
            </body></html>
            """,
            """
            <html><head><meta name="csrf-token" content="b"></head><body>
              <script>window.dynamic="rotated";</script>
              <div class="catalog"><picture><img src="/img/a.jpg?cache=9&utm_medium=social"></picture><div class="title">Les prix gagnants</div>
              <div class="subtitle">Du lundi 13 juillet au dimanche 26 juillet 2026</div>
              <div class="link"><a href="https://www.carrefour-reunion.com/catalogues/carrefour/644-les-prix-gagnants?fbclid=123"
                data-flipping-book-id="644" data-brand="carrefour">Consultez</a></div></div>
            </body></html>
            """,
        ]
        technical = InMemoryRepositories()
        parser = _StaticParser()
        repository = DryRunRepositories(technical)
        collector = _HtmlSequenceCollector(html_pages)

        with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": collector}), patch("app.main.get_parsers", return_value={"carrefour_reunion": parser}), patch("app.main.get_repository", side_effect=[repository, repository]):
            first_summary = run(self.settings)
            second_summary = run(self.settings)

        self.assertEqual(first_summary.sources_changed, 1)
        self.assertEqual(second_summary.sources_changed, 0)
        self.assertEqual(second_summary.candidates_detected, 0)
        self.assertEqual(parser.calls, 1)
        latest_snapshot = list(technical.snapshots.values())[-1]
        self.assertFalse(latest_snapshot["changed"])
        self.assertEqual(latest_snapshot["status"], "skipped_unchanged")

    def test_auchan_semantic_fingerprint_skips_unchanged_second_pass(self):
        source = SourceDefinition(
            slug="auchan-saint-louis-catalogues",
            name="Auchan Saint-Louis catalogues",
            content_family="shopping",
            source_type="html",
            source_url="https://www.auchansaintlouis.com/les-catalogues",
            official_domain="auchansaintlouis.com",
            parser_key="auchan_saint_louis",
            scope_type="commune",
            retailer_slug="auchan-saint-louis",
            commune="Saint-Louis",
        )
        html_pages = [
            """
            <html><body>
              <div class="bg-white rounded-xl p-2">
                <div class="home-cat-item-imgrounded-lg"><img src="/images/catalogs/a.png?cache=1"></div>
                <div class="p-2"><div><div class="home-cat-item-infos-title line-clamp-1"><h2 class="fw-black">Le Pack</h2></div>
                <div class="text-sm text-black/50">Du 14/07/2026 au 26/07/2026</div></div>
                <div class="w-full flex flex-row justify-end"><a href="https://www.auchansaintlouis.com/catalogues/uuid-1?utm_source=fb" class="a-link">Consulter</a></div>
                </div>
              </div>
            </body></html>
            """,
            """
            <html><body>
              <script>window.cacheBuster="xyz";</script>
              <div class="bg-white rounded-xl p-2">
                <div class="home-cat-item-imgrounded-lg"><img src="/images/catalogs/a.png?cache=9&utm_campaign=promo"></div>
                <div class="p-2"><div><div class="home-cat-item-infos-title line-clamp-1"><h2 class="fw-black">Le Pack</h2></div>
                <div class="text-sm text-black/50">Du 14/07/2026 au 26/07/2026</div></div>
                <div class="w-full flex flex-row justify-end"><a href="https://www.auchansaintlouis.com/catalogues/uuid-1?fbclid=123" class="a-link">Consulter</a></div>
                </div>
              </div>
            </body></html>
            """,
        ]
        technical = InMemoryRepositories()
        parser = _StaticParser()
        repository = DryRunRepositories(technical)
        collector = _HtmlSequenceCollector(html_pages)

        with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": collector}), patch("app.main.get_parsers", return_value={"auchan_saint_louis": parser}), patch("app.main.get_repository", side_effect=[repository, repository]):
            first_summary = run(self.settings)
            second_summary = run(self.settings)

        self.assertEqual(first_summary.sources_changed, 1)
        self.assertEqual(second_summary.sources_changed, 0)
        self.assertEqual(second_summary.candidates_detected, 0)
        self.assertEqual(parser.calls, 1)
        latest_snapshot = list(technical.snapshots.values())[-1]
        self.assertFalse(latest_snapshot["changed"])
        self.assertEqual(latest_snapshot["status"], "skipped_unchanged")

    def test_magasins_u_and_run_market_still_skip_unchanged_second_pass(self):
        for source in (
            SourceDefinition(
                slug="magasins-u-reunion-home",
                name="Magasins U Reunion",
                content_family="shopping",
                source_type="html",
                source_url="https://www.magasins-u.re/",
                official_domain="magasins-u.re",
                parser_key="magasins_u_reunion",
                scope_type="island",
                retailer_slug="magasins-u-reunion",
            ),
            SourceDefinition(
                slug="run-market-reunion-home",
                name="Run Market Reunion",
                content_family="shopping",
                source_type="html",
                source_url="https://www.run-market.re/",
                official_domain="run-market.re",
                parser_key="run_market_reunion",
                scope_type="island",
                retailer_slug="run-market-reunion",
            ),
        ):
            with self.subTest(source=source.slug):
                technical = InMemoryRepositories()
                parser = _StaticParser()
                repository = DryRunRepositories(technical)
                if source.slug == "run-market-reunion-home":
                    stable_html = """
                    <html><body>
                      <div class="premium-carousel-template item-wrapper">
                        <style>.promo-card>.overlay{background-image:url("https://www.run-market.re/wp-content/uploads/2026/07/OP7-3-CAROUSSEL-SITE-INTERNET-MAJ.png?cache=1");}</style>
                        <div class="elementor-widget-container"><p>Du lundi 20 juillet au dimanche 2 aout 2026</p></div>
                        <div class="elementor-widget-container"><h1 class="elementor-heading-title">NOUVEAU CATALOGUE</h1></div>
                        <div class="elementor-widget-container"><p>Decouvrez sans plus attendre nos meilleures offres promotionnelles.</p></div>
                        <div class="elementor-button-wrapper"><a class="elementor-button elementor-button-link" href="https://runmarket.interactive-catalogue.com/petit-prix-20-juillet-au-2-aout-2026/?page=1&utm_source=fb" target="_blank"><span class="elementor-button-text">Consultez maintenant</span></a></div>
                      </div>
                    </body></html>
                    """
                else:
                    stable_html = "<html>stable</html>"
                collector = _HtmlSequenceCollector([stable_html, stable_html])
                with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": collector}), patch("app.main.get_parsers", return_value={source.parser_key: parser}), patch("app.main.get_repository", side_effect=[repository, repository]):
                    first_summary = run(self.settings)
                    second_summary = run(self.settings)
                self.assertEqual(first_summary.sources_changed, 1)
                self.assertEqual(second_summary.sources_changed, 0)
                self.assertEqual(second_summary.candidates_detected, 0)
                self.assertEqual(parser.calls, 1)

    def test_semantic_fingerprint_failure_records_failed_snapshot_without_parsing(self):
        source = SourceDefinition(
            slug="carrefour-reunion-catalogues",
            name="Carrefour Reunion catalogues",
            content_family="shopping",
            source_type="html",
            source_url="https://www.carrefour-reunion.com/catalogues/carrefour",
            official_domain="carrefour-reunion.com",
            parser_key="carrefour_reunion",
            scope_type="island",
            retailer_slug="carrefour-reunion",
        )
        technical = InMemoryRepositories()
        parser = _StaticParser()
        repository = DryRunRepositories(technical)
        collector = _HtmlSequenceCollector(["<html><body><script>nonce</script></body></html>"])

        with patch("app.main.get_default_sources", return_value=[source]), patch("app.main.get_collectors", return_value={"html": collector}), patch("app.main.get_parsers", return_value={"carrefour_reunion": parser}), patch("app.main.get_repository", return_value=repository):
            summary = run(self.settings)

        self.assertEqual(summary.errors_count, 1)
        self.assertEqual(parser.calls, 0)
        snapshot = next(iter(technical.snapshots.values()))
        self.assertEqual(snapshot["status"], "failed")

    def test_source_slug_bypasses_global_max_sources_limit(self):
        technical = InMemoryRepositories()
        repository = DryRunRepositories(technical)
        html = """
        <html><body><ul class="dropdown-menu" role="menu">
          <li><a href="/public/catalogues/26run15-HYPER" target="_blank"
                title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (HYPER). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (HYPER)</a></li>
          <li><a href="/public/catalogues/26run15-EXPRESS" target="_blank"
                title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (EXPRESS). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (EXPRESS)</a></li>
        </ul></body></html>
        """
        collector = _HtmlSequenceCollector([html])
        settings = self.settings.with_overrides(collector_source_slug="e-leclerc-reunion-catalogues", collector_max_sources=0)

        with patch("app.main.get_collectors", return_value={"html": collector}), patch("app.main.get_repository", return_value=repository):
            summary = run(settings)

        self.assertEqual(summary.sources_checked, 1)
        self.assertEqual(summary.candidates_detected, 2)
        self.assertEqual(len(technical.good_deals), 0)


if __name__ == "__main__":
    unittest.main()
