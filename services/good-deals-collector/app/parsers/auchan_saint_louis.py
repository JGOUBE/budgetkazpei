from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.source_fingerprint import extract_auchan_catalog_entries

from .base import BaseParser


class AuchanSaintLouisParser(BaseParser):
    parser_key = "auchan_saint_louis"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = []
        for entry in extract_auchan_catalog_entries(source, document):
            # An undated or already expired leaflet must never become an
            # automatically published, current catalogue.
            if entry.starts_at is None or entry.ends_at is None:
                continue

            suffix = entry.stable_id or entry.canonical_url
            candidate = self.make_candidate(
                source,
                external_key=self.build_external_key(source, suffix),
                title=entry.title,
                description=entry.source_excerpt or entry.period_text or entry.title,
                source_url=entry.canonical_url,
                source_excerpt=entry.source_excerpt or entry.period_text or entry.title,
            )
            candidate.business_name = "Auchan Saint-Louis"
            candidate.retailer_slug = "auchan-saint-louis"
            candidate.commune = "Saint-Louis"
            candidate.scope_type = "commune"
            candidate.category = "shopping"
            candidate.starts_at = entry.starts_at
            candidate.ends_at = entry.ends_at
            candidate.source_page = document.final_url
            candidate.tags = ["catalogue", "auchan"]
            candidates.append(candidate)
        return candidates
