from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition

from .generic_catalog import GenericCatalogParser


class AuchanSaintLouisParser(GenericCatalogParser):
    parser_key = "auchan_saint_louis"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = super().parse(source, document)
        for candidate in candidates:
            candidate.business_name = "Auchan Saint-Louis"
            candidate.retailer_slug = "auchan-saint-louis"
            candidate.commune = "Saint-Louis"
            candidate.tags = ["catalogue", "auchan"]
        return candidates
