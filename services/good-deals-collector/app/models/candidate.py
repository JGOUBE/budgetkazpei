from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


def _parse_datetime(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


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
    reviewed_by: str | None = None
    review_notes: str | None = None
    published_at: datetime | None = None
    rejected_at: datetime | None = None
    rejection_reason: str | None = None

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
            "review_notes": self.review_notes,
            "rejection_reason": self.rejection_reason,
        }

    @classmethod
    def from_row(cls, row: dict[str, Any], *, source_slug: str) -> "Candidate":
        return cls(
            source_slug=source_slug,
            external_key=str(row["external_key"]),
            content_family=str(row["content_family"]),
            content_kind=str(row["content_kind"]),
            title=str(row["title"]),
            description=str(row["description"]),
            source_url=str(row["source_url"]),
            scope_type=str(row["scope_type"]),
            business_name=row.get("business_name"),
            retailer_slug=row.get("retailer_slug"),
            organizer_name=row.get("organizer_name"),
            product_name=row.get("product_name"),
            normalized_product_name=row.get("normalized_product_name"),
            brand=row.get("brand"),
            size_label=row.get("size_label"),
            category=row.get("category"),
            tags=list(row.get("tags") or []),
            promo_price=float(row["promo_price"]) if row.get("promo_price") is not None else None,
            original_price=float(row["original_price"]) if row.get("original_price") is not None else None,
            discount_percent=float(row["discount_percent"]) if row.get("discount_percent") is not None else None,
            unit_price=float(row["unit_price"]) if row.get("unit_price") is not None else None,
            unit_label=row.get("unit_label"),
            price_note=row.get("price_note"),
            is_free=row.get("is_free"),
            commune=row.get("commune"),
            micro_region=row.get("micro_region"),
            locality=row.get("locality"),
            territory_name=row.get("territory_name"),
            starts_at=_parse_datetime(row.get("starts_at")),
            ends_at=_parse_datetime(row.get("ends_at")),
            source_page=row.get("source_page"),
            source_excerpt=row.get("source_excerpt"),
            confidence_score=int(row.get("confidence_score") or 0),
            confidence_reasons=list(row.get("confidence_reasons") or []),
            validation_errors=list(row.get("validation_errors") or []),
            duplicate_key=row.get("duplicate_key"),
            possible_duplicate_id=row.get("possible_duplicate_id"),
            status=str(row.get("status") or "detected"),
            published_good_deal_id=row.get("published_good_deal_id"),
            source_id=row.get("source_id"),
            snapshot_id=row.get("snapshot_id"),
            detected_at=_parse_datetime(row.get("detected_at")),
            reviewed_at=_parse_datetime(row.get("reviewed_at")),
            reviewed_by=row.get("reviewed_by"),
            review_notes=row.get("review_notes"),
            published_at=_parse_datetime(row.get("published_at")),
            rejected_at=_parse_datetime(row.get("rejected_at")),
            rejection_reason=row.get("rejection_reason"),
        )
