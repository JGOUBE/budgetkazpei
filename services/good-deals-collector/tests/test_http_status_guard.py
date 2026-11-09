import unittest

from app.collectors.base import HttpResponse
from app.collectors.html_collector import HtmlCollector
from app.config import Settings
from app.models.source import SourceDefinition


class StubFetcher:
    def __init__(self, status_code):
        self.status_code = status_code
        self.calls = 0

    def fetch(self, source, settings):
        self.calls += 1
        return HttpResponse(
            status_code=self.status_code,
            url=source.source_url,
            content=b"<html><body>Forbidden</body></html>",
            headers={"content-type": "text/html"},
        )


class HttpStatusGuardTests(unittest.TestCase):
    def setUp(self):
        self.source = SourceDefinition(
            slug="test-catalogue", name="Catalogue test",
            content_family="shopping", source_type="html",
            source_url="https://example.com/catalogues",
            official_domain="example.com", parser_key="generic_catalog",
            scope_type="island",
        )
        self.settings = Settings.from_env()

    def test_403_must_not_be_parsed_as_an_official_catalogue(self):
        fetcher = StubFetcher(403)
        collector = HtmlCollector(fetcher=fetcher)
        with self.assertRaisesRegex(RuntimeError, "source_http_status_403"):
            collector.collect(self.source, self.settings)
        self.assertEqual(fetcher.calls, 1)

    def test_200_can_be_parsed_normally(self):
        fetcher = StubFetcher(200)
        document = HtmlCollector(fetcher=fetcher).collect(self.source, self.settings)
        self.assertEqual(document.http_status, 200)
        self.assertEqual(document.source_slug, self.source.slug)


if __name__ == "__main__":
    unittest.main()
