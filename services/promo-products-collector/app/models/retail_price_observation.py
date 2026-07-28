from __future__ import annotations

from dataclasses import dataclass, field


PRICE_TYPES = ("observed_price", "promotion", "receipt_price")
CHANNEL_TYPES = ("public_drive", "website", "catalog", "receipt", "partner_feed")


@dataclass(slots=True)
class RetailPriceObservation:
    source_type: str
    source_url: str
    source_product_id: str | None
    source_category_id: str | None
    source_observed_at: str
    retailer_slug: str
    retailer_name: str
    store_slug: str
    store_name: str
    channel: str
    raw_product_name: str | None
    product_name: str | None
    normalized_product_name: str | None
    brand: str | None
    package_format: str | None
    quantity_value: float | None
    quantity_unit: str | None
    pack_count: int | None
    total_quantity_value: float | None
    total_quantity_unit: str | None
    barcode: str | None
    category: str | None
    subcategory: str | None
    image_url: str | None
    product_url: str | None
    current_price: float | None
    original_price: float | None
    unit_price: float | None
    unit_price_unit: str | None
    currency: str
    price_type: str
    promotion_proven: bool
    promotion_evidence: str | None
    promo_badge: str | None
    discount_percent: float | None
    loyalty_amount: float | None
    loyalty_type: str | None
    offer_mechanism: str | None
    conditions: str | None
    starts_at: str | None
    ends_at: str | None
    matched_market_product_id: str | None = None
    matched_product_key: str | None = None
    match_method: str | None = None
    match_confidence: float | None = None
    match_warnings: list[str] = field(default_factory=list)
    extraction_confidence: int = 0
    validation_errors: list[str] = field(default_factory=list)
    availability_status: str | None = None
    raw_evidence: dict[str, object] = field(default_factory=dict)
    duplicate_key: str | None = None
    is_duplicate: bool = False
    duplicate_of: str | None = None

    def __post_init__(self) -> None:
        if self.price_type not in PRICE_TYPES:
            raise ValueError(f"Unsupported price_type: {self.price_type}")
        if self.channel not in CHANNEL_TYPES:
            raise ValueError(f"Unsupported channel: {self.channel}")

    def to_dict(self) -> dict[str, object]:
        return {
            "source_type": self.source_type,
            "source_url": self.source_url,
            "source_product_id": self.source_product_id,
            "source_category_id": self.source_category_id,
            "source_observed_at": self.source_observed_at,
            "retailer_slug": self.retailer_slug,
            "retailer_name": self.retailer_name,
            "store_slug": self.store_slug,
            "store_name": self.store_name,
            "channel": self.channel,
            "raw_product_name": self.raw_product_name,
            "product_name": self.product_name,
            "normalized_product_name": self.normalized_product_name,
            "brand": self.brand,
            "package_format": self.package_format,
            "quantity_value": self.quantity_value,
            "quantity_unit": self.quantity_unit,
            "pack_count": self.pack_count,
            "total_quantity_value": self.total_quantity_value,
            "total_quantity_unit": self.total_quantity_unit,
            "barcode": self.barcode,
            "category": self.category,
            "subcategory": self.subcategory,
            "image_url": self.image_url,
            "product_url": self.product_url,
            "current_price": self.current_price,
            "original_price": self.original_price,
            "unit_price": self.unit_price,
            "unit_price_unit": self.unit_price_unit,
            "currency": self.currency,
            "price_type": self.price_type,
            "promotion_proven": self.promotion_proven,
            "promotion_evidence": self.promotion_evidence,
            "promo_badge": self.promo_badge,
            "discount_percent": self.discount_percent,
            "loyalty_amount": self.loyalty_amount,
            "loyalty_type": self.loyalty_type,
            "offer_mechanism": self.offer_mechanism,
            "conditions": self.conditions,
            "starts_at": self.starts_at,
            "ends_at": self.ends_at,
            "matched_market_product_id": self.matched_market_product_id,
            "matched_product_key": self.matched_product_key,
            "match_method": self.match_method,
            "match_confidence": self.match_confidence,
            "match_warnings": list(self.match_warnings),
            "extraction_confidence": self.extraction_confidence,
            "validation_errors": list(self.validation_errors),
            "availability_status": self.availability_status,
            "raw_evidence": dict(self.raw_evidence),
            "duplicate_key": self.duplicate_key,
            "is_duplicate": self.is_duplicate,
            "duplicate_of": self.duplicate_of,
        }
