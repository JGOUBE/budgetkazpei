from __future__ import annotations

from .base import BaseCollector


class ImageCollector(BaseCollector):
    def extract_text(self, content: bytes, content_type: str) -> str:
        return ""
