from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher

from app.models.promotion_candidate import PromotionCandidate


@dataclass(frozen=True)
class DeduplicationSummary:
    duplicate_same_page: int
    duplicate_cross_page: int


def annotate_duplicates(candidates: list[PromotionCandidate]) -> DeduplicationSummary:
    duplicate_same_page = 0
    duplicate_cross_page = 0
    canonicals: list[PromotionCandidate] = []

    for candidate in sorted(
        candidates,
        key=lambda item: (-item.extraction_confidence, item.page_number, item.region_id),
    ):
        duplicate_type = ""
        duplicate_of: str | None = None
        for canonical in canonicals:
            if not _looks_duplicate(canonical, candidate):
                continue
            duplicate_of = canonical.region_id
            duplicate_type = "duplicate_same_page" if canonical.page_number == candidate.page_number else "duplicate_cross_page"
            break

        if not duplicate_of:
            canonicals.append(candidate)
            continue

        candidate.is_duplicate = True
        candidate.duplicate_of = duplicate_of
        candidate.candidate_status = "needs_review"
        if duplicate_type not in candidate.validation_errors:
            candidate.validation_errors.append(duplicate_type)
        if duplicate_type == "duplicate_same_page":
            duplicate_same_page += 1
        else:
            duplicate_cross_page += 1

    return DeduplicationSummary(
        duplicate_same_page=duplicate_same_page,
        duplicate_cross_page=duplicate_cross_page,
    )


def _looks_duplicate(left: PromotionCandidate, right: PromotionCandidate) -> bool:
    if not left.normalized_product_name or not right.normalized_product_name:
        return False
    if left.promo_price is None or right.promo_price is None:
        return False
    if abs(left.promo_price - right.promo_price) > 0.009:
        return False
    if left.package_format and right.package_format and left.package_format.lower() != right.package_format.lower():
        return False

    similarity = SequenceMatcher(None, left.normalized_product_name, right.normalized_product_name).ratio()
    if similarity < 0.92:
        return False

    if left.page_number == right.page_number:
        return left.bounding_box.overlap_ratio(right.bounding_box) >= 0.25
    return True
