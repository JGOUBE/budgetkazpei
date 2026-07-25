from __future__ import annotations

from app.models.candidate import Candidate

from .hashing import sha256_text
from .normalization import normalize_size_label, normalize_text


def build_duplicate_key(candidate: Candidate) -> str:
    if candidate.content_kind == "promotion":
        parts = [
            candidate.retailer_slug or "",
            candidate.normalized_product_name or normalize_text(candidate.product_name),
            normalize_size_label(candidate.size_label) or "",
            f"{candidate.promo_price:.2f}" if candidate.promo_price is not None else "",
            candidate.starts_at.date().isoformat() if candidate.starts_at else "",
            candidate.ends_at.date().isoformat() if candidate.ends_at else "",
            candidate.scope_type or "",
            candidate.commune or candidate.locality or "",
        ]
    elif candidate.content_kind == "event":
        parts = [
            normalize_text(candidate.organizer_name or candidate.business_name),
            normalize_text(candidate.title),
            normalize_text(candidate.commune),
            normalize_text(candidate.locality),
            candidate.starts_at.date().isoformat() if candidate.starts_at else "",
            candidate.ends_at.date().isoformat() if candidate.ends_at else "",
        ]
    else:
        parts = [
            normalize_text(candidate.organizer_name or candidate.business_name),
            normalize_text(candidate.title),
            normalize_text(candidate.commune),
            normalize_text(candidate.locality or candidate.territory_name),
        ]
    canonical = "|".join(parts)
    return sha256_text(canonical)
