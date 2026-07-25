from __future__ import annotations

from .base import BaseCollector


class HtmlCollector(BaseCollector):
    def extract_text(self, content: bytes, content_type: str) -> str:
        return self.html_to_text(content.decode("utf-8", errors="ignore"))
