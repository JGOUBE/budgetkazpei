from __future__ import annotations

from io import BytesIO

from .base import BaseCollector


class PdfCollector(BaseCollector):
    def extract_text(self, content: bytes, content_type: str) -> str:
        try:
            from pypdf import PdfReader  # type: ignore

            reader = PdfReader(BytesIO(content))
            parts: list[str] = []
            for page in reader.pages[:20]:
                parts.append(page.extract_text() or "")
            return "\n".join(parts).strip()
        except Exception:
            return ""
