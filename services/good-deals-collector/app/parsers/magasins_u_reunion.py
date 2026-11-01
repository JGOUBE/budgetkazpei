from __future__ import annotations

import html
import re
from datetime import datetime, timedelta, timezone

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.normalization import normalize_text, normalize_url, parse_french_date

from .base import BaseParser
from .generic_catalog import GenericCatalogParser


# Magasins U publishes one article per catalogue on /catalogues/.
# Extract the dated article links rather than guessing a single period
# from the home page (which can contain several, including expired ones).
CATALOGUE_LINK_RE = re.compile(
    r'<a\\b[^>]*\\bhref\\s*=\\s*["\\\']([^"\\\']+)["\\\'][^>]*>(.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
DATE_RANGE_RE = re.compile(
    r'\\bdu\\s+(\\d{1,2})(?:er)?(?:\\s+([a-zA-Zéèêëàâîïôùûüç]+))?'
    r'\\s+au\\s+(\\d{1,2})(?:er)?\\s+([a-zA-Zéèêëàâîïôùûüç]+)\\s+(20\\d{2})\\b',
    re.IGNORECASE,
)


class MagasinsUReunionParser(GenericCatalogParser):
    parser_key = "magasins_u_reunion"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        raw = document.content_bytes.decode("utf-8", errors="ignore")
        candidates = []
        seen_urls = set()

        for match in CATALOGUE_LINK_RE.finditer(raw):
            href, anchor_html = match.groups()
            title = re.sub(r"<[^>]+>", " ", anchor_html)
            title = re.sub(r"\\s+", " ", html.unescape(title)).strip()
            if "catalogue" not in normalize_text(title):
                continue
            date_match = DATE_RANGE_RE.search(title)
            if not date_match:
                continue

            start_day, start_month, end_day, end_month, year = date_match.groups()
            start_month = start_month or end_month
            start = parse_french_date(f"{start_day} {start_month} {year}", default_year=int(year))
            end = parse_french_date(f"{end_day} {end_month} {year}", default_year=int(year))
            if start is None or end is None:
                continue
            if end < start:
                # A period like 29 December to 10 January spans a new year.
                end = parse_french_date(f"{end_day} {end_month} {int(year) + 1}", default_year=int(year) + 1)
                if end is None or end < start:
                    continue

            # The catalogue remains valid through the end date, inclusive.
            end = end + timedelta(days=1) - timedelta(seconds=1)
            url = normalize_url(href, document.final_url or source.source_url)
            if not url or not url.startswith("https://www.magasins-u.re/"):
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            candidate = self.make_candidate(
                source,
                external_key=self.build_external_key(source, url),
                title=title,
                description=title,
                source_url=url,
                source_excerpt=title,
            )
            candidate.content_kind = "promotion"
            candidate.business_name = "Magasins U Reunion"
            candidate.retailer_slug = "magasins-u-reunion"
            candidate.category = "shopping"
            candidate.scope_type = "island"
            candidate.starts_at = start
            candidate.ends_at = end
            candidate.tags = ["catalogue", "u"]
            candidates.append(candidate)

        # Never create an undated generic catalogue from the landing page.
        # It would be rejected repeatedly and could conceal broken extraction.
        return candidates
