from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SourceDefinition:
    slug: str
    name: str
    content_family: str
    source_type: str
    source_url: str
    official_domain: str
    parser_key: str
    scope_type: str
    retailer_slug: str | None = None
    organizer_name: str | None = None
    commune: str | None = None
    micro_region: str | None = None
    check_frequency: str = "twice_monthly"
    trust_level: str = "high"
    is_official: bool = True
    is_active: bool = True
    metadata: dict[str, str] = field(default_factory=dict)

    @property
    def content_kind(self) -> str:
        if self.content_family == "shopping":
            return "promotion"
        if self.content_family == "event":
            return "event"
        if self.content_family == "permanent_leisure":
            return "permanent_leisure"
        return "other"
