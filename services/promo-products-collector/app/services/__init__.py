from .hashing import StreamHashResult, sha256_bytes, sha256_text
from .page_fingerprint import PageAssetMetadata, PageDecision, PageSnapshotRecord, plan_page_snapshot
from .page_layout_classifier import PageLayoutAnalysis, classify_page_layout, select_representative_pages
from .promotion_deduplication import DeduplicationSummary, annotate_duplicates
from .promotion_scoring import extract_promotion_candidates
from .retail_price_deduplication import RetailDeduplicationSummary, deduplicate_observations
from .retail_product_matching import MatchingSummary, ProductReference, simulate_matching
from .retail_product_normalization import (
    PackageNormalization,
    build_duplicate_key,
    normalize_lookup_key,
    normalize_product_name,
    parse_package_format,
    parse_unit_price,
)

__all__ = [
    "PageAssetMetadata",
    "PageDecision",
    "PageLayoutAnalysis",
    "PageSnapshotRecord",
    "DeduplicationSummary",
    "StreamHashResult",
    "annotate_duplicates",
    "build_duplicate_key",
    "classify_page_layout",
    "deduplicate_observations",
    "extract_promotion_candidates",
    "MatchingSummary",
    "normalize_lookup_key",
    "normalize_product_name",
    "PackageNormalization",
    "plan_page_snapshot",
    "parse_package_format",
    "parse_unit_price",
    "ProductReference",
    "RetailDeduplicationSummary",
    "select_representative_pages",
    "sha256_bytes",
    "sha256_text",
    "simulate_matching",
]
