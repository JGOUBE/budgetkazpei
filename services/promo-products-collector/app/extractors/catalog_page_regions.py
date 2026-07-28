from __future__ import annotations

import re
from dataclasses import dataclass
from statistics import median

from app.extractors.catalog_product_ocr import OcrLine, OcrPage
from app.models.promotion_candidate import BoundingBox


PRICE_RE = re.compile(r"(?<!\d)(?:\d{1,3}(?:[ .]\d{3})*[,.]\d{2}|\d{1,3}\s*€\s*\d{2})(?!\d)")
PERCENT_RE = re.compile(r"(?<!\d)(\d{1,3})\s*%")
UNIT_PRICE_RE = re.compile(
    r"(\d{1,3}(?:[ .]\d{3})*[,.]\d{2}|\d{1,3}\s*€\s*\d{2})\s*(?:/\s*|le\s+|la\s+)?(kg|g|l|cl|ml|litre|litres)",
    flags=re.IGNORECASE,
)
LAYOUT_TYPES = (
    "cover",
    "table_of_contents",
    "dense_list",
    "product_grid",
    "large_product_cards",
    "mixed_layout",
    "legal_or_conditions",
    "unknown",
)


@dataclass(frozen=True)
class PriceAnchor:
    line: OcrLine
    kind: str
    amount_count: int

    @property
    def bounding_box(self) -> BoundingBox:
        return self.line.bounding_box


@dataclass(frozen=True)
class PageRegion:
    page_number: int
    region_id: str
    bounding_box: BoundingBox
    lines: list[OcrLine]
    column_index: int
    layout_type: str = "unknown"
    price_anchor_count: int = 0
    segmentation_confidence: int = 0
    price_product_distance: float | None = None
    overlapping_region_count: int = 0

    @property
    def raw_text(self) -> str:
        return "\n".join(line.text for line in self.lines)

    def to_dict(self) -> dict[str, object]:
        return {
            "page_number": self.page_number,
            "region_id": self.region_id,
            "bounding_box": self.bounding_box.to_dict(),
            "column_index": self.column_index,
            "layout_type": self.layout_type,
            "price_anchor_count": self.price_anchor_count,
            "segmentation_confidence": self.segmentation_confidence,
            "price_product_distance": self.price_product_distance,
            "overlapping_region_count": self.overlapping_region_count,
            "lines": [line.to_dict() for line in self.lines],
            "raw_text": self.raw_text,
        }


def detect_regions(page: OcrPage, *, layout_type: str = "unknown") -> list[PageRegion]:
    lines = [line for line in page.lines if line.text.strip()]
    if not lines or layout_type in {"cover", "table_of_contents", "legal_or_conditions"}:
        return []

    anchors = [anchor for anchor in extract_price_anchors(lines) if anchor.kind in {"main", "starting_from", "percentage"}]
    if not anchors:
        return []

    columns = infer_columns(page, lines, anchors)
    regions: list[PageRegion] = []
    region_counter = 1

    for column_index, (left, right) in enumerate(columns):
        column_lines = [line for line in lines if _line_overlaps_column(line, left, right)]
        if not column_lines:
            continue
        column_anchors = [anchor for anchor in anchors if _line_overlaps_column(anchor.line, left, right)]
        if not column_anchors:
            continue

        ordered_lines = sorted(column_lines, key=lambda line: (line.bounding_box.top, line.bounding_box.left))
        line_index = {line.id: position for position, line in enumerate(ordered_lines)}
        for anchor_position, anchor in enumerate(sorted(column_anchors, key=lambda item: (item.bounding_box.top, item.bounding_box.left))):
            previous_anchor = column_anchors[anchor_position - 1] if anchor_position > 0 else None
            next_anchor = column_anchors[anchor_position + 1] if anchor_position + 1 < len(column_anchors) else None
            cluster = _build_anchor_cluster(
                anchor=anchor,
                page=page,
                column_left=left,
                column_right=right,
                column_lines=ordered_lines,
                line_index=line_index,
                previous_anchor=previous_anchor,
                next_anchor=next_anchor,
            )
            if not cluster or not _cluster_has_offer_signal(cluster):
                continue
            primary_count = len([item for item in column_anchors if _anchor_inside_lines(item, cluster)])
            distance = _price_product_distance(anchor, cluster)
            regions.append(
                PageRegion(
                    page_number=page.page_number,
                    region_id=f"p{page.page_number:03d}-r{region_counter:03d}",
                    bounding_box=_merge_cluster_boxes(cluster),
                    lines=cluster,
                    column_index=column_index,
                    layout_type=layout_type if layout_type in LAYOUT_TYPES else "unknown",
                    price_anchor_count=primary_count,
                    segmentation_confidence=_segmentation_confidence(
                        page=page,
                        lines=cluster,
                        price_anchor_count=primary_count,
                        price_product_distance=distance,
                    ),
                    price_product_distance=distance,
                )
            )
            region_counter += 1

    deduped = _dedupe_near_identical_regions(regions)
    return _annotate_overlap_counts(deduped)


def extract_price_anchors(lines: list[OcrLine]) -> list[PriceAnchor]:
    anchors: list[PriceAnchor] = []
    for line in lines:
        normalized = _normalize_text(line.text)
        amount_count = len(PRICE_RE.findall(line.text))
        kind = ""
        if UNIT_PRICE_RE.search(line.text):
            kind = "unit"
        elif any(keyword in normalized for keyword in ("ticket e leclerc", "ticket e.leclerc", "cagnotte", "carte e leclerc", "carte e.leclerc")):
            kind = "loyalty"
        elif any(keyword in normalized for keyword in ("ancien prix", "au lieu", "prix barre", "prix de reference")):
            kind = "original"
        elif any(keyword in normalized for keyword in ("a partir", "à partir")) and amount_count:
            kind = "starting_from"
        elif PERCENT_RE.search(line.text) and not amount_count:
            kind = "percentage"
        elif amount_count:
            kind = "main"
        elif "€" in line.text:
            kind = "main"
        if kind:
            anchors.append(PriceAnchor(line=line, kind=kind, amount_count=max(amount_count, 1 if "€" in line.text else 0)))
    return anchors


def infer_columns(
    page: OcrPage,
    lines: list[OcrLine],
    anchors: list[PriceAnchor] | None = None,
) -> list[tuple[float, float]]:
    reference_points = sorted(
        (anchor.bounding_box.center_x for anchor in (anchors or extract_price_anchors(lines))),
        key=float,
    )
    if not reference_points:
        return [(0.0, float(page.image_width))]

    split_points: list[float] = []
    min_gap = page.image_width * 0.18
    for current, following in zip(reference_points, reference_points[1:]):
        gap = following - current
        if gap >= min_gap:
            split_points.append((current + following) / 2)

    if not split_points:
        midpoint = page.image_width / 2
        left_anchors = len([value for value in reference_points if value < midpoint])
        right_anchors = len(reference_points) - left_anchors
        if left_anchors >= 2 and right_anchors >= 2:
            split_points.append(midpoint)

    if not split_points:
        return [(0.0, float(page.image_width))]

    edges = [0.0, *split_points, float(page.image_width)]
    return [(edges[index], edges[index + 1]) for index in range(len(edges) - 1)]


def _build_anchor_cluster(
    *,
    anchor: PriceAnchor,
    page: OcrPage,
    column_left: float,
    column_right: float,
    column_lines: list[OcrLine],
    line_index: dict[int, int],
    previous_anchor: PriceAnchor | None,
    next_anchor: PriceAnchor | None,
) -> list[OcrLine]:
    heights = [line.bounding_box.height for line in column_lines if line.bounding_box.height > 0]
    median_height = median(heights) if heights else 28.0
    anchor_idx = line_index.get(anchor.line.id, 0)
    vertical_padding = max(median_height * 0.6, 24.0)
    max_upward_distance = max(page.image_height * 0.12, median_height * 4.5)
    max_downward_distance = max(page.image_height * 0.08, median_height * 3.5)
    horizontal_padding = max(page.image_width * 0.06, 80.0)
    left_bound = max(column_left, anchor.bounding_box.left - horizontal_padding)
    right_bound = min(column_right, anchor.bounding_box.right + horizontal_padding)

    top_bound = max(column_left * 0, anchor.bounding_box.top - max_upward_distance)
    bottom_bound = min(float(page.image_height), anchor.bounding_box.bottom + max_downward_distance)
    if previous_anchor is not None:
        top_bound = max(top_bound, previous_anchor.bounding_box.bottom + vertical_padding)
    if next_anchor is not None:
        bottom_bound = min(bottom_bound, next_anchor.bounding_box.top - vertical_padding)

    selected: list[OcrLine] = [anchor.line]

    current_top = anchor.line.bounding_box.top
    scan_index = anchor_idx - 1
    while scan_index >= 0:
        line = column_lines[scan_index]
        gap = current_top - line.bounding_box.bottom
        if gap > vertical_padding or (anchor.bounding_box.top - line.bounding_box.top) > max_upward_distance:
            break
        if _has_primary_price(line.text) and line.id != anchor.line.id:
            break
        if _line_overlaps_band(line, left_bound, right_bound) or _is_descriptive_line(line.text):
            selected.insert(0, line)
            current_top = line.bounding_box.top
            left_bound = max(column_left, min(left_bound, line.bounding_box.left - 12.0))
            right_bound = min(column_right, max(right_bound, line.bounding_box.right + 12.0))
            top_bound = min(top_bound, line.bounding_box.top)
        scan_index -= 1

    current_bottom = anchor.line.bounding_box.bottom
    scan_index = anchor_idx + 1
    while scan_index < len(column_lines):
        line = column_lines[scan_index]
        gap = line.bounding_box.top - current_bottom
        if gap > vertical_padding or (line.bounding_box.bottom - anchor.bounding_box.bottom) > max_downward_distance:
            break
        if _has_primary_price(line.text) and not _is_secondary_price_context(line.text):
            break
        if _line_overlaps_band(line, left_bound, right_bound) or _is_secondary_price_context(line.text):
            selected.append(line)
            current_bottom = line.bounding_box.bottom
            left_bound = max(column_left, min(left_bound, line.bounding_box.left - 12.0))
            right_bound = min(column_right, max(right_bound, line.bounding_box.right + 12.0))
            bottom_bound = max(bottom_bound, line.bounding_box.bottom)
        scan_index += 1

    selected_ids = {line.id for line in selected}
    for line in column_lines:
        if line.id in selected_ids:
            continue
        if line.bounding_box.bottom < top_bound or line.bounding_box.top > bottom_bound:
            continue
        if not _line_overlaps_band(line, left_bound, right_bound):
            continue
        selected.append(line)

    return sorted({line.id: line for line in selected}.values(), key=lambda line: (line.bounding_box.top, line.bounding_box.left))


def _cluster_has_offer_signal(lines: list[OcrLine]) -> bool:
    has_price = any(_looks_like_offer_anchor(line.text) for line in lines)
    has_alpha = any(re.search(r"[A-Za-zÀ-ÿ]", line.text) for line in lines)
    return has_price and has_alpha


def _line_overlaps_column(line: OcrLine, left: float, right: float) -> bool:
    horizontal = max(0.0, min(line.bounding_box.right, right) - max(line.bounding_box.left, left))
    return horizontal > max(8.0, line.bounding_box.width * 0.18)


def _line_overlaps_band(line: OcrLine, left: float, right: float) -> bool:
    overlap = max(0.0, min(line.bounding_box.right, right) - max(line.bounding_box.left, left))
    return overlap > max(12.0, line.bounding_box.width * 0.12)


def _merge_cluster_boxes(lines: list[OcrLine]) -> BoundingBox:
    merged = lines[0].bounding_box
    for line in lines[1:]:
        merged = merged.union(line.bounding_box)
    return merged


def _has_primary_price(text: str) -> bool:
    normalized = _normalize_text(text)
    return bool(PRICE_RE.search(text)) and not any(
        keyword in normalized
        for keyword in ("ticket e leclerc", "ticket e.leclerc", "cagnotte", "ancien prix", "prix barre")
    )


def _is_secondary_price_context(text: str) -> bool:
    normalized = _normalize_text(text)
    return bool(UNIT_PRICE_RE.search(text)) or any(
        keyword in normalized
        for keyword in (
            "ticket e leclerc",
            "ticket e.leclerc",
            "cagnotte",
            "ancien prix",
            "prix barre",
            "voir modalites",
            "voir modalités",
            "au lieu",
            "kg",
            "litre",
            "ml",
        )
    )


def _is_descriptive_line(text: str) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return False
    if re.fullmatch(r"[\d.,%/\-\s€]+", text):
        return False
    return bool(re.search(r"[A-Za-zÀ-ÿ]", text))


def _anchor_inside_lines(anchor: PriceAnchor, lines: list[OcrLine]) -> bool:
    line_ids = {line.id for line in lines}
    return anchor.line.id in line_ids


def _price_product_distance(anchor: PriceAnchor, lines: list[OcrLine]) -> float | None:
    text_lines = [
        line for line in lines
        if line.id != anchor.line.id
        and _is_descriptive_line(line.text)
        and not _looks_like_offer_anchor(line.text)
    ]
    if not text_lines:
        return None
    return round(min(abs(anchor.bounding_box.center_y - line.bounding_box.center_y) for line in text_lines), 3)


def _segmentation_confidence(
    *,
    page: OcrPage,
    lines: list[OcrLine],
    price_anchor_count: int,
    price_product_distance: float | None,
) -> int:
    score = 58
    if price_anchor_count == 1:
        score += 20
    elif price_anchor_count == 2:
        score -= 8
    else:
        score -= 20
    if 2 <= len(lines) <= 8:
        score += 10
    elif len(lines) >= 12:
        score -= 12
    region_box = _merge_cluster_boxes(lines)
    if region_box.height <= page.image_height * 0.22:
        score += 8
    else:
        score -= 10
    if price_product_distance is None:
        score -= 10
    elif price_product_distance <= page.image_height * 0.08:
        score += 8
    else:
        score -= 8
    return max(0, min(100, score))


def _dedupe_near_identical_regions(regions: list[PageRegion]) -> list[PageRegion]:
    ordered = sorted(regions, key=lambda region: (region.bounding_box.top, region.bounding_box.left))
    deduped: list[PageRegion] = []
    for region in ordered:
        duplicate = False
        for existing in deduped:
            same_page = existing.page_number == region.page_number
            same_column = existing.column_index == region.column_index
            similar_box = existing.bounding_box.overlap_ratio(region.bounding_box) >= 0.82
            if same_page and same_column and similar_box:
                duplicate = True
                break
        if not duplicate:
            deduped.append(region)
    return deduped


def _annotate_overlap_counts(regions: list[PageRegion]) -> list[PageRegion]:
    annotated: list[PageRegion] = []
    for region in regions:
        overlaps = 0
        for other in regions:
            if other is region:
                continue
            if other.page_number != region.page_number:
                continue
            if region.bounding_box.overlap_ratio(other.bounding_box) >= 0.25:
                overlaps += 1
        annotated.append(
            PageRegion(
                page_number=region.page_number,
                region_id=region.region_id,
                bounding_box=region.bounding_box,
                lines=region.lines,
                column_index=region.column_index,
                layout_type=region.layout_type,
                price_anchor_count=region.price_anchor_count,
                segmentation_confidence=max(0, region.segmentation_confidence - (overlaps * 10)),
                price_product_distance=region.price_product_distance,
                overlapping_region_count=overlaps,
            )
        )
    return annotated


def _looks_like_offer_anchor(text: str) -> bool:
    normalized = _normalize_text(text)
    return (
        bool(PRICE_RE.search(text))
        or bool(PERCENT_RE.search(text))
        or "ticket e leclerc" in normalized
        or "ticket e.leclerc" in normalized
        or "cagnotte" in normalized
        or "à partir" in text.lower()
        or "a partir" in normalized
        or "€" in text
    )


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()
