from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .geometry_types import OCRDocument, OCRToken
from .line_reconstructor import ReconstructedLine


_NUMERIC_LIKE = re.compile(
    r"^[\s*+\-]*(?:\d+(?:[.,]\d+)?|\d+[.,]\d+)(?:\s*(?:€|EUR|%|KG|G|CL))?$",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ColumnLayout:
    """Horizontal anchors used to classify OCR tokens."""

    price_anchor_x: float
    vat_anchor_x: float
    price_vat_boundary_x: float
    description_price_boundary_x: float
    source: str
    header_line_id: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "price_anchor_x": round(self.price_anchor_x, 3),
            "vat_anchor_x": round(self.vat_anchor_x, 3),
            "price_vat_boundary_x": round(self.price_vat_boundary_x, 3),
            "description_price_boundary_x": round(
                self.description_price_boundary_x, 3
            ),
            "source": self.source,
            "header_line_id": self.header_line_id,
        }


class ColumnDetector:
    """
    Detects the receipt's description, price and VAT-code columns.

    The preferred strategy uses the printed TTC / TVA header. A conservative
    ratio-based fallback is kept for receipts where the header is missing or
    badly recognized.
    """

    VAT_LABELS = {"TVA", "TUA"}
    PRICE_LABELS = {"TTC"}
    CURRENCY_LABELS = {"€", "EUR"}

    def __init__(
        self,
        *,
        fallback_price_ratio: float = 0.67,
        fallback_vat_ratio: float = 0.74,
    ) -> None:
        if not 0 < fallback_price_ratio < fallback_vat_ratio < 1:
            raise ValueError(
                "fallback ratios must satisfy 0 < price < vat < 1"
            )
        self.fallback_price_ratio = fallback_price_ratio
        self.fallback_vat_ratio = fallback_vat_ratio

    @staticmethod
    def _normalize(text: str) -> str:
        return re.sub(r"\s+", " ", text.strip().upper())

    @classmethod
    def _is_numeric_like(cls, text: str) -> bool:
        normalized = cls._normalize(text).replace(",", ".")
        return bool(_NUMERIC_LIKE.fullmatch(normalized))

    def detect_layout(
        self,
        document: OCRDocument,
        lines: list[ReconstructedLine],
    ) -> ColumnLayout:
        for line in sorted(lines, key=lambda item: item.center_y):
            price_tokens = [
                token
                for token in line.tokens
                if self._normalize(token.text) in self.PRICE_LABELS
            ]
            vat_tokens = [
                token
                for token in line.tokens
                if self._normalize(token.text) in self.VAT_LABELS
            ]

            if price_tokens and vat_tokens:
                price_anchor = price_tokens[0].box.center_x
                vat_anchor = vat_tokens[0].box.center_x
                if price_anchor < vat_anchor:
                    return self._build_layout(
                        price_anchor=price_anchor,
                        vat_anchor=vat_anchor,
                        source="header",
                        header_line_id=line.line_id,
                    )

        return self._build_layout(
            price_anchor=document.image_width * self.fallback_price_ratio,
            vat_anchor=document.image_width * self.fallback_vat_ratio,
            source="ratio_fallback",
            header_line_id=None,
        )

    @staticmethod
    def _build_layout(
        *,
        price_anchor: float,
        vat_anchor: float,
        source: str,
        header_line_id: int | None,
    ) -> ColumnLayout:
        gap = max(1.0, vat_anchor - price_anchor)

        # The price column is visually wider than the one-digit VAT-code
        # column. Keeping 65% of the gap for prices handles perspective shifts
        # on long tickets without moving VAT codes into the price column.
        price_vat_boundary = price_anchor + (gap * 0.65)

        # Numeric details such as "2 X 1.56€" and weight lines remain on the
        # left. Only values sufficiently close to the right-hand amount column
        # are considered final line prices.
        description_price_boundary = price_anchor - max(70.0, gap)

        return ColumnLayout(
            price_anchor_x=price_anchor,
            vat_anchor_x=vat_anchor,
            price_vat_boundary_x=price_vat_boundary,
            description_price_boundary_x=description_price_boundary,
            source=source,
            header_line_id=header_line_id,
        )

    def classify_token(self, token: OCRToken, layout: ColumnLayout) -> str:
        normalized = self._normalize(token.text)

        if normalized in self.PRICE_LABELS or normalized in self.CURRENCY_LABELS:
            return "price"
        if normalized in self.VAT_LABELS:
            return "vat"

        if not self._is_numeric_like(token.text):
            return "description"

        center_x = token.box.center_x
        if center_x >= layout.price_vat_boundary_x:
            return "vat"
        if center_x >= layout.description_price_boundary_x:
            return "price"
        return "detail"

    def assign_columns(
        self,
        document: OCRDocument,
        lines: list[ReconstructedLine],
    ) -> ColumnLayout:
        layout = self.detect_layout(document, lines)
        for token in document.tokens:
            token.column = self.classify_token(token, layout)
        return layout


def save_columnized_lines(
    document: OCRDocument,
    lines: list[ReconstructedLine],
    layout: ColumnLayout,
    output_path: str | Path,
) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "source": document.source,
        "image_width": document.image_width,
        "image_height": document.image_height,
        "elapsed_seconds": document.elapsed_seconds,
        "engine": document.engine,
        "layout": layout.to_dict(),
        "reconstructed_line_count": len(lines),
        "lines": [line.to_dict() for line in lines],
    }

    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
