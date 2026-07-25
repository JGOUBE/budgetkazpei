from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.normalization import compact_excerpt

from .base import BaseParser


class GenericPermanentLeisureParser(BaseParser):
    parser_key = "generic_permanent_leisure"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        text = document.extracted_text or document.content_bytes.decode("utf-8", errors="ignore")
        title = source.name
        candidate = self.make_candidate(
            source,
            external_key=self.build_external_key(source, document.sha256[:12]),
            title=title,
            description=compact_excerpt(text, 500) or title,
            source_url=document.final_url,
            source_excerpt=compact_excerpt(text, 240),
        )
        candidate.content_kind = "permanent_leisure"
        candidate.business_name = source.organizer_name or source.name
        candidate.category = "Loisirs & famille"
        candidate.is_free = True if "gratuit" in text.lower() else None
        candidate.price_note = "Horaires et conditions a verifier sur la page officielle"
        return [candidate]
