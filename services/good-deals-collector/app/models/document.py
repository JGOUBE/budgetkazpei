from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SourceDocument:
    source_slug: str
    source_url: str
    final_url: str | None
    content_type: str | None
    http_status: int | None
    content_bytes: bytes
    extracted_text: str
    sha256: str | None
    etag: str | None = None
    last_modified_header: str | None = None
    content_length_hint: int | None = None
    metadata: dict[str, str] = field(default_factory=dict)

    @property
    def content_length(self) -> int | None:
        if self.content_length_hint is not None:
            return self.content_length_hint
        if self.http_status is None and self.final_url is None and self.content_type is None and self.sha256 is None:
            return None
        return len(self.content_bytes)
