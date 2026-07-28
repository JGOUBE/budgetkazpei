from __future__ import annotations

from dataclasses import dataclass

from app.extractors.catalog_page_regions import PriceAnchor, extract_price_anchors, infer_columns
from app.extractors.catalog_product_ocr import OcrPage


@dataclass(frozen=True)
class PageLayoutAnalysis:
    page_number: int
    layout_type: str
    number_of_price_anchors: int
    estimated_product_regions: int
    recommended_for_mvp: bool
    line_count: int
    column_count: int

    def to_dict(self) -> dict[str, object]:
        return {
            "page_number": self.page_number,
            "layout_type": self.layout_type,
            "number_of_price_anchors": self.number_of_price_anchors,
            "estimated_product_regions": self.estimated_product_regions,
            "recommended_for_mvp": self.recommended_for_mvp,
            "line_count": self.line_count,
            "column_count": self.column_count,
        }


def classify_page_layout(page: OcrPage) -> PageLayoutAnalysis:
    lines = [line for line in page.lines if line.text.strip()]
    anchors = extract_price_anchors(lines)
    primary_anchors = [anchor for anchor in anchors if anchor.kind in {"main", "starting_from", "percentage"}]
    columns = infer_columns(page, lines, anchors) if lines else [(0.0, float(page.image_width))]
    text_area = sum(line.bounding_box.width * line.bounding_box.height for line in lines)
    page_area = max(float(page.image_width * page.image_height), 1.0)
    text_coverage = text_area / page_area
    average_line_height = (
        sum(line.bounding_box.height for line in lines) / len(lines)
        if lines else 0.0
    )
    average_line_width = (
        sum(line.bounding_box.width for line in lines) / len(lines)
        if lines else 0.0
    )
    legal_keywords = sum(
        1 for line in lines
        if any(
            token in line.text.lower()
            for token in ("voir conditions", "conditions", "modalites", "modalités", "hors textile", "ticket e.leclerc")
        )
    )

    layout_type = "unknown"
    if not primary_anchors and len(lines) <= 10 and text_coverage < 0.035:
        layout_type = "cover"
    elif legal_keywords >= 2 and len(primary_anchors) <= 1:
        layout_type = "legal_or_conditions"
    elif len(primary_anchors) >= 8 and len(lines) >= 24 and text_coverage >= 0.045:
        layout_type = "dense_list"
    elif len(primary_anchors) >= 4 and len(columns) >= 2 and text_coverage <= 0.08:
        layout_type = "product_grid"
    elif 1 <= len(primary_anchors) <= 4 and text_coverage <= 0.05 and average_line_width <= page.image_width * 0.55:
        layout_type = "large_product_cards"
    elif len(primary_anchors) >= 2:
        layout_type = "mixed_layout"
    elif len(lines) >= 8 and text_coverage <= 0.04 and average_line_height <= 24:
        layout_type = "table_of_contents"

    estimated_regions = max(0, len(primary_anchors))
    recommended = layout_type in {"product_grid", "large_product_cards", "mixed_layout"}
    if layout_type == "mixed_layout" and average_line_width >= page.image_width * 0.72:
        recommended = False
    if layout_type == "dense_list":
        recommended = False

    return PageLayoutAnalysis(
        page_number=page.page_number,
        layout_type=layout_type,
        number_of_price_anchors=len(primary_anchors),
        estimated_product_regions=estimated_regions,
        recommended_for_mvp=recommended,
        line_count=len(lines),
        column_count=len(columns),
    )


def select_representative_pages(analyses: list[PageLayoutAnalysis]) -> list[PageLayoutAnalysis]:
    grids = [item for item in analyses if item.layout_type == "product_grid" and item.recommended_for_mvp]
    cards = [item for item in analyses if item.layout_type in {"large_product_cards", "mixed_layout"} and item.recommended_for_mvp]
    dense = [item for item in analyses if item.layout_type == "dense_list"]

    selected: list[PageLayoutAnalysis] = []
    selected.extend(grids[:2])
    for item in cards:
        if len(selected) >= 4:
            break
        if item.page_number not in {existing.page_number for existing in selected}:
            selected.append(item)
    if len(selected) < 4:
        for item in grids[2:]:
            if len(selected) >= 4:
                break
            if item.page_number not in {existing.page_number for existing in selected}:
                selected.append(item)
    if len(selected) < 5:
        for item in cards:
            if len(selected) >= 5:
                break
            if item.page_number not in {existing.page_number for existing in selected}:
                selected.append(item)
    if dense:
        dense_choice = dense[0]
        if dense_choice.page_number not in {existing.page_number for existing in selected} and len(selected) < 5:
            selected.append(dense_choice)
    return sorted(selected, key=lambda item: item.page_number)
