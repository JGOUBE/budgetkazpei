from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any, Iterable

from .geometry_types import OCRDocument, OCRToken


@dataclass(slots=True)
class ReconstructedLine:
    """A physical text row reconstructed from OCR tokens."""

    line_id: int
    tokens: list[OCRToken]
    center_y: float
    y_min: float
    y_max: float

    @property
    def text(self) -> str:
        return " | ".join(token.text for token in self.tokens)

    @property
    def token_indexes(self) -> list[int]:
        return [token.index for token in self.tokens]

    def to_dict(self) -> dict[str, Any]:
        return {
            "line_id": self.line_id,
            "center_y": round(self.center_y, 3),
            "y_min": round(self.y_min, 3),
            "y_max": round(self.y_max, 3),
            "text": self.text,
            "token_indexes": self.token_indexes,
            "tokens": [token.to_dict() for token in self.tokens],
        }


class LineReconstructor:
    """
    Groups OCR blocks that belong to the same physical receipt row.

    The grouping is based on the vertical centre of each OCR block. We do not
    merge blocks merely because their rectangles overlap vertically: on curved
    or perspective-distorted receipts, adjacent rows often overlap slightly
    and overlap-based grouping can chain several products and section headers
    into one false row.
    """

    def __init__(
        self,
        *,
        tolerance_ratio: float = 0.38,
        min_tolerance_px: float = 6.0,
        max_tolerance_px: float = 12.0,
    ) -> None:
        if tolerance_ratio <= 0:
            raise ValueError("tolerance_ratio must be greater than 0")
        if min_tolerance_px <= 0:
            raise ValueError("min_tolerance_px must be greater than 0")
        if max_tolerance_px < min_tolerance_px:
            raise ValueError("max_tolerance_px must be >= min_tolerance_px")

        self.tolerance_ratio = tolerance_ratio
        self.min_tolerance_px = min_tolerance_px
        self.max_tolerance_px = max_tolerance_px

    def _compute_tolerance(self, tokens: Iterable[OCRToken]) -> float:
        heights = [token.box.height for token in tokens if token.box.height > 0]
        if not heights:
            return self.min_tolerance_px

        adaptive = median(heights) * self.tolerance_ratio
        return max(self.min_tolerance_px, min(adaptive, self.max_tolerance_px))

    @staticmethod
    def _line_center(tokens: list[OCRToken]) -> float:
        """
        Median is intentionally used instead of a running mean.

        A median centre resists drift when one OCR box is unusually tall or
        slightly displaced by ticket curvature.
        """
        return float(median(token.box.center_y for token in tokens))

    def reconstruct(self, document: OCRDocument) -> list[ReconstructedLine]:
        tokens = sorted(
            document.tokens,
            key=lambda token: (token.box.center_y, token.box.x_min, token.index),
        )
        tolerance = self._compute_tolerance(tokens)

        clusters: list[list[OCRToken]] = []

        for token in tokens:
            best_cluster_index: int | None = None
            best_distance = float("inf")

            for index, cluster in enumerate(clusters):
                center_distance = abs(
                    token.box.center_y - self._line_center(cluster)
                )

                if center_distance <= tolerance and center_distance < best_distance:
                    best_distance = center_distance
                    best_cluster_index = index

            if best_cluster_index is None:
                clusters.append([token])
            else:
                clusters[best_cluster_index].append(token)

        clusters.sort(key=self._line_center)

        reconstructed: list[ReconstructedLine] = []
        for line_id, cluster in enumerate(clusters):
            cluster.sort(key=lambda token: (token.box.x_min, token.index))

            for token in cluster:
                token.line_id = line_id

            reconstructed.append(
                ReconstructedLine(
                    line_id=line_id,
                    tokens=cluster,
                    center_y=self._line_center(cluster),
                    y_min=min(token.box.y_min for token in cluster),
                    y_max=max(token.box.y_max for token in cluster),
                )
            )

        return reconstructed


def save_reconstructed_lines(
    document: OCRDocument,
    lines: list[ReconstructedLine],
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
        "reconstructed_line_count": len(lines),
        "lines": [line.to_dict() for line in lines],
    }

    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
