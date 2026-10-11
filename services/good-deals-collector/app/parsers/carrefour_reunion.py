from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.source_fingerprint import extract_carrefour_catalog_entries

from .base import BaseParser


class CarrefourReunionParser(BaseParser):
    parser_key = "carrefour_reunion"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = []
        for entry in extract_carrefour_catalog_entries(source, document):
            suffix = entry.stable_id or entry.canonical_url
            candidate = self.make_candidate(
                source,
                external_key=self.build_external_key(source, suffix),
                title=entry.title,
                description=entry.source_excerpt or entry.period_text or entry.title,
                source_url=entry.canonical_url,
                source_excerpt=entry.source_excerpt or entry.period_text or entry.title,
            )
            candidate.business_name = "Carrefour Reunion"
            candidate.retailer_slug = "carrefour-reunion"
            candidate.category = "shopping"
            candidate.starts_at = entry.starts_at
            candidate.ends_at = entry.ends_at
            candidate.source_page = document.final_url
            candidate.tags = ["catalogue", "carrefour"]
            candidates.append(candidate)
        return candidates
