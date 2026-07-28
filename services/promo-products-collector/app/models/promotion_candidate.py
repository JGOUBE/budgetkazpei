from __future__ import annotations

from dataclasses import dataclass, field


OFFER_MECHANISMS = (
    "direct_discount",
    "loyalty_credit",
    "percentage_discount",
    "multi_buy",
    "second_item_discount",
    "free_item",
    "starting_from",
    "simple_price",
    "unknown",
)

CANDIDATE_STATUSES = ("reliable", "needs_review", "rejected")


@dataclass(slots=True)
class BoundingBox:
    left: float
    top: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.left + self.width

    @property
    def bottom(self) -> float:
        return self.top + self.height

    @property
    def center_x(self) -> float:
        return self.left + (self.width / 2)

    @property
    def center_y(self) -> float:
        return self.top + (self.height / 2)

    def union(self, other: "BoundingBox") -> "BoundingBox":
        left = min(self.left, other.left)
        top = min(self.top, other.top)
        right = max(self.right, other.right)
        bottom = max(self.bottom, other.bottom)
        return BoundingBox(left=left, top=top, width=right - left, height=bottom - top)

    def overlap_ratio(self, other: "BoundingBox") -> float:
        horizontal = max(0.0, min(self.right, other.right) - max(self.left, other.left))
        vertical = max(0.0, min(self.bottom, other.bottom) - max(self.top, other.top))
        intersection = horizontal * vertical
        if intersection <= 0:
            return 0.0
        self_area = max(self.width * self.height, 1.0)
        other_area = max(other.width * other.height, 1.0)
        return intersection / min(self_area, other_area)

    def to_dict(self) -> dict[str, float]:
        return {
            "left": round(self.left, 3),
            "top": round(self.top, 3),
            "width": round(self.width, 3),
            "height": round(self.height, 3),
            "right": round(self.right, 3),
            "bottom": round(self.bottom, 3),
        }


@dataclass(slots=True)
class PromotionCandidate:
    page_number: int
    region_id: str
    bounding_box: BoundingBox
    raw_text: str
    product_name: str | None
    normalized_product_name: str | None
    brand: str | None
    package_format: str | None
    quantity_value: float | None
    quantity_unit: str | None
    promo_price: float | None
    original_price: float | None
    discount_percent: float | None
    unit_price: float | None
    unit_price_unit: str | None
    loyalty_amount: float | None
    loyalty_type: str | None
    offer_mechanism: str
    conditions: str | None
    starts_at: str | None
    ends_at: str | None
    extraction_confidence: int
    segmentation_confidence: int | None = None
    price_product_distance: float | None = None
    price_anchor_count: int = 0
    overlapping_region_count: int = 0
    layout_type: str = "unknown"
    validation_errors: list[str] = field(default_factory=list)
    candidate_status: str = "needs_review"
    is_duplicate: bool = False
    duplicate_of: str | None = None
    source_pages: list[int] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.offer_mechanism not in OFFER_MECHANISMS:
            raise ValueError(f"Unsupported offer_mechanism: {self.offer_mechanism}")
        if self.candidate_status not in CANDIDATE_STATUSES:
            raise ValueError(f"Unsupported candidate_status: {self.candidate_status}")
        if not self.source_pages:
            self.source_pages.append(self.page_number)

    def to_dict(self) -> dict[str, object]:
        return {
            "page_number": self.page_number,
            "region_id": self.region_id,
            "bounding_box": self.bounding_box.to_dict(),
            "raw_text": self.raw_text,
            "product_name": self.product_name,
            "normalized_product_name": self.normalized_product_name,
            "brand": self.brand,
            "package_format": self.package_format,
            "quantity_value": self.quantity_value,
            "quantity_unit": self.quantity_unit,
            "promo_price": self.promo_price,
            "original_price": self.original_price,
            "discount_percent": self.discount_percent,
            "unit_price": self.unit_price,
            "unit_price_unit": self.unit_price_unit,
            "loyalty_amount": self.loyalty_amount,
            "loyalty_type": self.loyalty_type,
            "offer_mechanism": self.offer_mechanism,
            "conditions": self.conditions,
            "starts_at": self.starts_at,
            "ends_at": self.ends_at,
            "extraction_confidence": self.extraction_confidence,
            "segmentation_confidence": self.segmentation_confidence,
            "price_product_distance": self.price_product_distance,
            "price_anchor_count": self.price_anchor_count,
            "overlapping_region_count": self.overlapping_region_count,
            "layout_type": self.layout_type,
            "validation_errors": list(self.validation_errors),
            "candidate_status": self.candidate_status,
            "is_duplicate": self.is_duplicate,
            "duplicate_of": self.duplicate_of,
            "source_pages": list(self.source_pages),
        }
