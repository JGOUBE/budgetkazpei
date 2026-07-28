from __future__ import annotations

import re
from dataclasses import dataclass
from statistics import median

from app.extractors.catalog_product_ocr import OcrLine, OcrPage
from app.models.promotion_candidate import BoundingBox


PRICE_RE = re.compile(r"(?<!\d)(\d{1,3}(?:[ .]\d{3})*[,.]\d{2})(?!\d)")
PERCENT_RE = re.compile(r"(?<!\d)(\d{1,3})\s*%")


@dataclass(frozen=True)
class PageRegion:
    page_number: int
    region_id: str
    bounding_box: BoundingBox
    lines: list[OcrLine]
    column_index: int

    @property
    def raw_text(self) -> str:
        return "\n".join(line.text for line in self.lines)

    def to_dict(self) -> dict[str, object]:
        return {
            "page_number": self.page_number,
            "region_id": self.region_id,
            "bounding_box": self.bounding_box.to_dict(),
            "column_index": self.column_index,
            "lines": [line.to_dict() for line in self.lines],
            "raw_text": self.raw_text,
        }


def detect_regions(page: OcrPage) -> list[PageRegion]:
    lines = [line for line in page.lines if line.text.strip()]
    if not lines:
        return []

    columns = _infer_columns(page, lines)
    regions: list[PageRegion] = []
    region_counter = 1

    for column_index, (left, right) in enumerate(columns):
        column_lines = [line for line in lines if _line_overlaps_column(line, left, right)]
        if not column_lines:
            continue
        for cluster in _cluster_lines(column_lines, page.image_height):
            if not _cluster_has_offer_signal(cluster):
                continue
            bounding_box = _merge_cluster_boxes(cluster)
            regions.append(
                PageRegion(
                    page_number=page.page_number,
                    region_id=f"p{page.page_number:03d}-r{region_counter:03d}",
                    bounding_box=bounding_box,
                    lines=cluster,
                    column_index=column_index,
                )
            )
            region_counter += 1

    return _merge_overlapping_regions(regions)


def _infer_columns(page: OcrPage, lines: list[OcrLine]) -> list[tuple[float, float]]:
    anchors = [line for line in lines if _looks_like_offer_anchor(line.text)]
    midpoint = page.image_width / 2
    left_count = len([line for line in anchors if line.bounding_box.center_x < midpoint])
    right_count = len([line for line in anchors if line.bounding_box.center_x >= midpoint])
    if left_count >= 1 and right_count >= 1:
        return [(0.0, midpoint), (midpoint, float(page.image_width))]
    return [(0.0, float(page.image_width))]


def _cluster_lines(lines: list[OcrLine], page_height: int) -> list[list[OcrLine]]:
    ordered = sorted(lines, key=lambda line: (line.bounding_box.top, line.bounding_box.left))
    heights = [line.bounding_box.height for line in ordered if line.bounding_box.height > 0]
    threshold = max(page_height * 0.015, (median(heights) if heights else 24.0) * 1.8, 26.0)

    clusters: list[list[OcrLine]] = []
    current: list[OcrLine] = []
    previous_bottom = 0.0
    for line in ordered:
        if not current:
            current = [line]
            previous_bottom = line.bounding_box.bottom
            continue
        gap = line.bounding_box.top - previous_bottom
        if gap > threshold:
            clusters.append(current)
            current = [line]
        else:
            current.append(line)
        previous_bottom = max(previous_bottom, line.bounding_box.bottom)
    if current:
        clusters.append(current)
    return clusters


def _cluster_has_offer_signal(lines: list[OcrLine]) -> bool:
    has_price = any(_looks_like_offer_anchor(line.text) for line in lines)
    has_alpha = any(re.search(r"[A-Za-zÀ-ÿ]", line.text) for line in lines)
    return has_price and has_alpha


def _looks_like_offer_anchor(text: str) -> bool:
    normalized = text.lower()
    return (
        bool(PRICE_RE.search(text))
        or bool(PERCENT_RE.search(text))
        or "ticket e.leclerc" in normalized
        or "ticket e leclerc" in normalized
        or "cagnotte" in normalized
        or "à partir" in normalized
        or "a partir" in normalized
    )


def _line_overlaps_column(line: OcrLine, left: float, right: float) -> bool:
    horizontal = max(0.0, min(line.bounding_box.right, right) - max(line.bounding_box.left, left))
    return horizontal > max(8.0, line.bounding_box.width * 0.18)


def _merge_cluster_boxes(lines: list[OcrLine]) -> BoundingBox:
    merged = lines[0].bounding_box
    for line in lines[1:]:
        merged = merged.union(line.bounding_box)
    return merged


def _merge_overlapping_regions(regions: list[PageRegion]) -> list[PageRegion]:
    ordered = sorted(regions, key=lambda region: (region.bounding_box.top, region.bounding_box.left))
    merged: list[PageRegion] = []
    for region in ordered:
        if not merged:
            merged.append(region)
            continue
        previous = merged[-1]
        if (
            previous.page_number == region.page_number
            and previous.column_index == region.column_index
            and previous.bounding_box.overlap_ratio(region.bounding_box) >= 0.45
        ):
            lines = sorted(previous.lines + region.lines, key=lambda line: (line.bounding_box.top, line.bounding_box.left))
            merged[-1] = PageRegion(
                page_number=previous.page_number,
                region_id=previous.region_id,
                bounding_box=previous.bounding_box.union(region.bounding_box),
                lines=lines,
                column_index=previous.column_index,
            )
            continue
        merged.append(region)
    return merged
