from __future__ import annotations

import re
from datetime import datetime, timezone

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.normalization import compact_excerpt, parse_french_date

from .base import BaseParser


class GenericEventParser(BaseParser):
    parser_key = "generic_event"

    def parse(self, source: SourceDefinition, document: SourceDocument):
        text = document.extracted_text or document.content_bytes.decode("utf-8", errors="ignore")
        title = self._guess_title(text, source.name)
        starts_at, ends_at = self._find_dates(text)
        candidate = self.make_candidate(
            source,
            external_key=self.build_external_key(source, f"{title}-{starts_at or document.sha256[:8]}"),
            title=title,
            description=compact_excerpt(text, 500) or title,
            source_url=document.final_url,
            source_excerpt=compact_excerpt(text, 240),
        )
        candidate.content_kind = "event"
        candidate.business_name = source.organizer_name or source.name
        candidate.category = "Loisirs & famille"
        candidate.starts_at = starts_at
        candidate.ends_at = ends_at or starts_at
        candidate.is_free = self._looks_free(text)
        return [candidate]

    @staticmethod
    def _guess_title(text: str, fallback: str) -> str:
        for line in re.split(r"[\r\n]+", text):
            line = line.strip()
            if len(line) >= 12:
                return line[:140]
        return fallback

    @staticmethod
    def _find_dates(text: str) -> tuple[datetime | None, datetime | None]:
        matches = re.findall(r"(\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?)", text, flags=re.IGNORECASE)
        if not matches:
            return None, None
        today = datetime.now(timezone.utc)
        start = parse_french_date(matches[0], default_year=today.year)
        end = parse_french_date(matches[1], default_year=today.year) if len(matches) > 1 else start
        return start, end

    @staticmethod
    def _looks_free(text: str) -> bool | None:
        cleaned = text.lower()
        if "gratuit" in cleaned or "entrée libre" in cleaned:
            return True
        if "payant" in cleaned or "tarif" in cleaned:
            return False
        return None
