from __future__ import annotations

import re
from datetime import datetime, timezone

from app.models.candidate import Candidate
from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.normalization import compact_excerpt, normalize_text, parse_decimal


class BaseParser:
    parser_key = "base"

    def parse(self, source: SourceDefinition, document: SourceDocument) -> list[Candidate]:
        raise NotImplementedError

    @staticmethod
    def build_external_key(source: SourceDefinition, suffix: str) -> str:
        return f"{source.slug}:{normalize_text(suffix).replace(' ', '-')}"

    @staticmethod
    def find_prices(text: str) -> list[float]:
        matches = re.findall(r"(\d{1,3}(?:[.,]\d{2}))\s*€", text)
        return [parse_decimal(match) for match in matches if parse_decimal(match) is not None]

    @staticmethod
    def default_detected_at() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def make_candidate(
        source: SourceDefinition,
        *,
        external_key: str,
        title: str,
        description: str,
        source_url: str | None = None,
        source_excerpt: str | None = None,
    ) -> Candidate:
        return Candidate(
            source_slug=source.slug,
            external_key=external_key,
            content_family=source.content_family,
            content_kind=source.content_kind,
            title=title,
            description=description,
            source_url=source_url or source.source_url,
            scope_type=source.scope_type,
            retailer_slug=source.retailer_slug,
            organizer_name=source.organizer_name,
            commune=source.commune,
            micro_region=source.micro_region,
            source_excerpt=compact_excerpt(source_excerpt or description),
            detected_at=BaseParser.default_detected_at(),
        )
