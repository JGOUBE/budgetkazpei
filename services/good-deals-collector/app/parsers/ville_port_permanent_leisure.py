from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition

from .generic_permanent_leisure import GenericPermanentLeisureParser


class VillePortPermanentLeisureParser(GenericPermanentLeisureParser):
    parser_key = "ville_port_permanent_leisure"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = super().parse(source, document)
        for candidate in candidates:
            candidate.business_name = "Ville du Port"
            candidate.organizer_name = "Ville du Port"
            candidate.commune = "Le Port"
            candidate.tags = ["ville-du-port", "loisir-permanent"]
        return candidates
