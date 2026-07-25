from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition

from .generic_catalog import GenericCatalogParser


class MagasinsUReunionParser(GenericCatalogParser):
    parser_key = "magasins_u_reunion"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = super().parse(source, document)
        for candidate in candidates:
            candidate.business_name = "Magasins U Reunion"
            candidate.retailer_slug = "magasins-u-reunion"
            candidate.tags = ["catalogue", "u"]
        return candidates
