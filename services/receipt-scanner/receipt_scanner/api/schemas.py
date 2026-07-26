from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


CanonicalStatus = Literal[
    "trusted",
    "budget_ok_articles_partial",
    "needs_review",
    "scan_not_exploitable",
]


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool
    scan_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "budgetkazpei-receipt-scanner"
    engine: str = "rapidocr-onnxruntime"
    model_loaded: bool = False


class ReadyResponse(HealthResponse):
    ready: bool = True
    auth_mode: str
    quota_mode: str
    parser_mode: Literal["legacy", "shadow", "v2_safe"]
    max_concurrent_scans: int
    diagnostics_enabled: bool


class ReceiptSummary(BaseModel):
    store_name: str | None = None
    store_location: str | None = None
    receipt_date: str | None = None
    receipt_time: str | None = None
    declared_item_count: int | None = None
    counted_quantity: float
    product_line_count: int
    items_total: float
    total: float | None = None
    article_total: float | None = None
    immediate_discount_total: float | None = None
    payable_total: float | None = None


class ItemSummary(BaseModel):
    raw_name: str
    canonical_name: str | None = None
    quantity: float
    unit_price: float | None = None
    total_price: float
    weight_kg: float | None = None
    price_per_kg: float | None = None
    vat_code: int | None = None
    item_type: str
    ocr_confidence: float
    needs_review: bool
    eligible_for_courses: bool
    eligible_for_market_database: bool


class OverlapDiagnostics(BaseModel):
    used: bool
    matched_anchor_count: int | None = None
    average_similarity: float | None = None


class ParserDiagnostics(BaseModel):
    requested_mode: Literal["legacy", "shadow", "v2_safe"]
    used_mode: Literal["legacy", "v2_safe"]
    production_output_changed: bool
    fallback_reasons: list[str] = Field(default_factory=list)
    v2_total: float | None = None
    v2_total_kind: str | None = None
    v2_items_total: float | None = None
    v2_product_line_count: int | None = None
    v2_counted_quantity: int | None = None
    v2_declared_count: int | None = None
    v2_score: float | None = None
    v2_reasons: list[str] = Field(default_factory=list)
    comparison: dict[str, object] | None = None


class ScanDiagnostics(BaseModel):
    engine: str
    elapsed_seconds: float
    token_count: int
    rotation_degrees: int | None = None
    overlap: OverlapDiagnostics = Field(
        default_factory=lambda: OverlapDiagnostics(used=False)
    )
    parser: ParserDiagnostics


class ScanResponse(BaseModel):
    scan_id: str
    mode: Literal["single", "long_receipt"]
    status: CanonicalStatus
    exploitable: bool
    should_record_budget: bool
    budget_amount: float | None = None
    article_data_mode: Literal["full", "partial", "blocked", "none"]
    should_feed_courses: bool
    should_feed_market_database: bool
    should_feed_verified_articles: bool
    requires_user_validation: bool
    unattributed_amount: float | None = None
    receipt: ReceiptSummary
    items: list[ItemSummary]
    warnings: list[str]
    reasons: list[str]
    diagnostics: ScanDiagnostics | None = None
