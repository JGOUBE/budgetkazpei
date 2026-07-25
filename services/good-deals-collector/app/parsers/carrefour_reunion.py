from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition

from .generic_catalog import GenericCatalogParser


class CarrefourReunionParser(GenericCatalogParser):
    parser_key = "carrefour_reunion"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = super().parse(source, document)
        for candidate in candidates:
            candidate.business_name = "Carrefour Reunion"
            candidate.retailer_slug = "carrefour-reunion"
            candidate.tags = ["catalogue", "carrefour"]
        return candidates
