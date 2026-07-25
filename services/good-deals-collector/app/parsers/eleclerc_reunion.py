from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.normalization import normalize_text
from app.services.source_fingerprint import extract_eleclerc_catalog_entries

from .base import BaseParser


class EleclercReunionParser(BaseParser):
    parser_key = "eleclerc_reunion"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        entries = extract_eleclerc_catalog_entries(source, document)
        candidates = []
        for entry in entries:
            suffix = entry.stable_id or f"{entry.title}-{entry.starts_at.isoformat() if entry.starts_at else 'undated'}"
            candidate = self.make_candidate(
                source,
                external_key=self.build_external_key(source, suffix),
                title=entry.title,
                description=entry.period_text or entry.title,
                source_url=entry.canonical_url,
                source_excerpt=entry.source_excerpt or entry.period_text or entry.title,
            )
            candidate.business_name = "E.Leclerc Reunion"
            candidate.retailer_slug = "eleclerc-reunion"
            candidate.product_name = entry.title
            candidate.normalized_product_name = normalize_text(entry.title)
            candidate.category = "shopping"
            candidate.starts_at = entry.starts_at
            candidate.ends_at = entry.ends_at
            candidate.source_page = document.final_url
            candidate.tags = ["catalogue", "e-leclerc"]
            if entry.store_format:
                candidate.tags.append(normalize_text(entry.store_format))
            candidates.append(candidate)
        return candidates
