import unittest

from app.collectors.registry import get_default_sources
from app.models.document import SourceDocument
from app.parsers.eleclerc_reunion import EleclercReunionParser
from app.services.confidence import score_candidate
from app.services.hashing import sha256_text


ELECLERC_HTML = """
<html>
  <body>
    <ul class="dropdown-menu" role="menu">
      <li><a href="/public/catalogues/26run15-HYPER" target="_blank"
            title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (HYPER). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (HYPER)</a></li>
      <li><a href="/public/catalogues/26run15-EXPRESS" target="_blank"
            title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (EXPRESS). Du 14 Juillet Au 28 Juillet 2026.">Celebrons le Tour de France avec E.Leclerc (EXPRESS)</a></li>
      <li><a href="/public/catalogues/26run15-MAISON" target="_blank"
            title="Catalogue E.Leclerc Reunion. Special Espace Maison Electromenager Technologie (MAISON). Du 14 Juillet Au 28 Juillet 2026.">Special Espace Maison Electromenager Technologie (MAISON)</a></li>
      <li><a href="/public/catalogues/26run15-EC" target="_blank"
            title="Catalogue E.Leclerc Reunion. Rentree des classes: le bon eleve des petits prix (ESPACE CULTUREL). Du 14 Juillet Au 26 Juillet 2026.">Rentree des classes: le bon eleve des petits prix (ESPACE CULTUREL)</a></li>
    </ul>
  </body>
</html>
"""

ELECLERC_HTML_MISSING_DATE = """
<html>
  <body>
    <ul class="dropdown-menu" role="menu">
      <li><a href="/public/catalogues/26run15-HYPER" target="_blank"
            title="Catalogue E.Leclerc Reunion. Celebrons le Tour de France avec E.Leclerc (HYPER).">Celebrons le Tour de France avec E.Leclerc (HYPER)</a></li>
    </ul>
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


class EleclercParserTests(unittest.TestCase):
    def setUp(self):
        self.source = next(source for source in get_default_sources() if source.slug == "e-leclerc-reunion-catalogues")
        self.parser = EleclercReunionParser()

    def test_parser_extracts_multiple_distinct_catalogs(self):
        candidates = self.parser.parse(self.source, _make_document(self.source, ELECLERC_HTML))
        self.assertEqual(len(candidates), 4)
        self.assertEqual(len({candidate.external_key for candidate in candidates}), 4)
        titles = {candidate.title for candidate in candidates}
        self.assertIn("Celebrons le Tour de France avec E.Leclerc (HYPER)", titles)
        self.assertIn("Celebrons le Tour de France avec E.Leclerc (EXPRESS)", titles)
        self.assertIn("Special Espace Maison Electromenager Technologie (MAISON)", titles)
        self.assertIn("Rentree des classes: le bon eleve des petits prix (ESPACE CULTUREL)", titles)

    def test_parser_keeps_distinct_formats_separated(self):
        candidates = self.parser.parse(self.source, _make_document(self.source, ELECLERC_HTML))
        hyper = next(candidate for candidate in candidates if "(HYPER)" in candidate.title)
        express = next(candidate for candidate in candidates if "(EXPRESS)" in candidate.title)
        self.assertNotEqual(hyper.external_key, express.external_key)

    def test_missing_date_yields_needs_review_after_scoring(self):
        candidate = self.parser.parse(self.source, _make_document(self.source, ELECLERC_HTML_MISSING_DATE))[0]
        score, reasons, errors, status = score_candidate(candidate)
        self.assertEqual(status, "needs_review")
        self.assertIn("date_fin_absente", errors)
        self.assertIsNone(candidate.starts_at)
        self.assertIsNone(candidate.ends_at)


if __name__ == "__main__":
    unittest.main()
