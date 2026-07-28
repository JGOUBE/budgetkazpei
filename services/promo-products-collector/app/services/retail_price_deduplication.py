from __future__ import annotations

from dataclasses import dataclass

from app.models.retail_price_observation import RetailPriceObservation


@dataclass(frozen=True)
class RetailDeduplicationSummary:
    total_input: int
    unique_observations: int
    duplicates: int


def deduplicate_observations(
    observations: list[RetailPriceObservation],
) -> tuple[list[RetailPriceObservation], RetailDeduplicationSummary]:
    by_key: dict[str, RetailPriceObservation] = {}
    duplicates = 0
    for index, observation in enumerate(observations):
        key = observation.duplicate_key or f"__row__{index}"
        current = by_key.get(key)
        if current is None:
            by_key[key] = observation
            continue

        preferred = _prefer_observation(current, observation)
        duplicate = observation if preferred is current else current
        duplicate.is_duplicate = True
        duplicate.duplicate_of = preferred.product_url or preferred.source_product_id
        by_key[key] = preferred
        duplicates += 1

    unique_items = list(by_key.values())
    unique_items.sort(
        key=lambda item: (
            item.category or "",
            item.subcategory or "",
            item.brand or "",
            item.product_name or "",
            item.current_price or 0,
        )
    )
    return unique_items, RetailDeduplicationSummary(
        total_input=len(observations),
        unique_observations=len(unique_items),
        duplicates=duplicates,
    )


def _prefer_observation(
    left: RetailPriceObservation,
    right: RetailPriceObservation,
) -> RetailPriceObservation:
    left_score = _quality_score(left)
    right_score = _quality_score(right)
    return right if right_score > left_score else left


def _quality_score(observation: RetailPriceObservation) -> int:
    score = observation.extraction_confidence
    if observation.promotion_proven:
        score += 30
    if observation.original_price is not None:
        score += 15
    if observation.unit_price is not None:
        score += 5
    if observation.brand:
        score += 4
    if observation.package_format:
        score += 4
    if observation.image_url:
        score += 1
    return score
