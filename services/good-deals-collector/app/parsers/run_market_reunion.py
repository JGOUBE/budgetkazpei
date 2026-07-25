from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.normalization import normalize_text
from app.services.source_fingerprint import extract_run_market_catalog_entries

from .base import BaseParser


class RunMarketReunionParser(BaseParser):
    parser_key = "run_market_reunion"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = []
        for entry in extract_run_market_catalog_entries(source, document):
            suffix = entry.stable_id or f"{entry.title}-{entry.starts_at.isoformat() if entry.starts_at else 'undated'}"
            candidate = self.make_candidate(
                source,
                external_key=self.build_external_key(source, suffix),
                title=entry.title,
                description=entry.source_excerpt or entry.period_text or entry.title,
                source_url=entry.canonical_url,
                source_excerpt=entry.source_excerpt or entry.period_text or entry.title,
            )
            candidate.product_name = entry.title
            candidate.normalized_product_name = normalize_text(entry.title)
            candidate.category = "shopping"
            candidate.starts_at = entry.starts_at
            candidate.ends_at = entry.ends_at
            candidate.source_page = document.final_url
            candidate.business_name = "Run Market Reunion"
            candidate.retailer_slug = "run-market-reunion"
            candidate.tags = ["catalogue", "run-market"]
            candidates.append(candidate)
        return candidates
