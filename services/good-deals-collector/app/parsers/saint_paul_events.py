from __future__ import annotations

from app.models.document import SourceDocument
from app.models.source import SourceDefinition

from .generic_event import GenericEventParser


class SaintPaulEventsParser(GenericEventParser):
    parser_key = "saint_paul_events"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        candidates = super().parse(source, document)
        for candidate in candidates:
            candidate.business_name = "Ville de Saint-Paul"
            candidate.organizer_name = "Ville de Saint-Paul"
            candidate.commune = "Saint-Paul"
            candidate.tags = ["commune", "saint-paul"]
        return candidates
