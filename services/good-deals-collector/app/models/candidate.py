from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Candidate:
    source_slug: str
    external_key: str
    content_family: str
    content_kind: str
    title: str
    description: str
    source_url: str
    scope_type: str
    business_name: str | None = None
    retailer_slug: str | None = None
    organizer_name: str | None = None
    product_name: str | None = None
    normalized_product_name: str | None = None
    brand: str | None = None
    size_label: str | None = None
    category: str | None = None
    tags: list[str] = field(default_factory=list)
    promo_price: float | None = None
    original_price: float | None = None
    discount_percent: float | None = None
    unit_price: float | None = None
    unit_label: str | None = None
    price_note: str | None = None
    is_free: bool | None = None
    commune: str | None = None
    micro_region: str | None = None
    locality: str | None = None
    territory_name: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    source_page: str | None = None
    source_excerpt: str | None = None
    confidence_score: int = 0
    confidence_reasons: list[str] = field(default_factory=list)
    validation_errors: list[str] = field(default_factory=list)
    duplicate_key: str | None = None
    possible_duplicate_id: str | None = None
    status: str = "detected"
    published_good_deal_id: str | None = None
    source_id: str | None = None
    snapshot_id: str | None = None
    detected_at: datetime | None = None
    reviewed_at: datetime | None = None
    published_at: datetime | None = None
    rejected_at: datetime | None = None

    def as_seed_row(self) -> dict[str, object]:
        return {
            "external_key": self.external_key,
            "content_family": self.content_family,
            "content_kind": self.content_kind,
            "title": self.title,
            "description": self.description,
            "business_name": self.business_name,
            "retailer_slug": self.retailer_slug,
            "organizer_name": self.organizer_name,
            "product_name": self.product_name,
            "normalized_product_name": self.normalized_product_name,
            "brand": self.brand,
            "size_label": self.size_label,
            "category": self.category,
            "tags": self.tags,
            "promo_price": self.promo_price,
            "original_price": self.original_price,
            "discount_percent": self.discount_percent,
            "unit_price": self.unit_price,
            "unit_label": self.unit_label,
            "price_note": self.price_note,
            "is_free": self.is_free,
            "commune": self.commune,
            "micro_region": self.micro_region,
            "locality": self.locality,
            "territory_name": self.territory_name,
            "scope_type": self.scope_type,
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "source_url": self.source_url,
            "source_page": self.source_page,
            "source_excerpt": self.source_excerpt,
            "confidence_score": self.confidence_score,
            "confidence_reasons": self.confidence_reasons,
            "validation_errors": self.validation_errors,
            "duplicate_key": self.duplicate_key,
            "possible_duplicate_id": self.possible_duplicate_id,
            "status": self.status,
        }
