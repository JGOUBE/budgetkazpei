from __future__ import annotations

from dataclasses import dataclass

from app.models.retail_price_observation import RetailPriceObservation
from app.services.retail_product_normalization import normalize_lookup_key


@dataclass(frozen=True)
class ProductReference:
    product_id: str
    canonical_name: str
    brand: str | None
    package_format: str | None
    barcode: str | None = None
    external_ids: tuple[str, ...] = ()
    alias_labels: tuple[str, ...] = ()


@dataclass(frozen=True)
class MatchingSummary:
    backend: str
    matched: int
    suggested: int
    ambiguous: int
    unmatched: int


def simulate_matching(
    observations: list[RetailPriceObservation],
    references: list[ProductReference] | None = None,
) -> MatchingSummary:
    references = references or []
    if not references:
        for observation in observations:
            observation.match_method = None
            observation.match_confidence = None
            observation.match_warnings.append("matching_backend_unavailable_in_local_session")
        return MatchingSummary(
            backend="unavailable",
            matched=0,
            suggested=0,
            ambiguous=0,
            unmatched=len(observations),
        )

    matched = 0
    suggested = 0
    ambiguous = 0
    unmatched = 0

    for observation in observations:
        exact = _find_exact_reference(observation, references)
        if exact is not None:
            observation.matched_market_product_id = exact.product_id
            observation.matched_product_key = normalize_lookup_key(exact.canonical_name)
            observation.match_method = "exact"
            observation.match_confidence = 1.0
            matched += 1
            continue

        suggestion = _find_best_suggestion(observation, references)
        if suggestion is None:
            observation.match_method = None
            observation.match_confidence = None
            unmatched += 1
            continue

        product, confidence = suggestion
        observation.matched_market_product_id = None
        observation.matched_product_key = normalize_lookup_key(product.canonical_name)
        observation.match_method = "suggestion"
        observation.match_confidence = confidence
        observation.match_warnings.append("human_validation_required")
        if confidence >= 0.9:
            suggested += 1
        else:
            ambiguous += 1

    return MatchingSummary(
        backend="local_reference",
        matched=matched,
        suggested=suggested,
        ambiguous=ambiguous,
        unmatched=unmatched,
    )


def _find_exact_reference(
    observation: RetailPriceObservation,
    references: list[ProductReference],
) -> ProductReference | None:
    barcode = (observation.barcode or "").strip()
    if barcode:
        for reference in references:
            if reference.barcode and reference.barcode == barcode:
                return reference

    source_product_id = (observation.source_product_id or "").strip().lower()
    if source_product_id:
        for reference in references:
            if source_product_id in {item.lower() for item in reference.external_ids}:
                return reference

    normalized_name = normalize_lookup_key(observation.product_name or observation.raw_product_name)
    normalized_brand = normalize_lookup_key(observation.brand)
    normalized_package = normalize_lookup_key(observation.package_format)
    for reference in references:
        reference_name = normalize_lookup_key(reference.canonical_name)
        if normalized_name != reference_name:
            continue
        if normalized_brand and normalize_lookup_key(reference.brand) not in {"", normalized_brand}:
            continue
        if normalized_package and normalize_lookup_key(reference.package_format) not in {"", normalized_package}:
            continue
        return reference
    return None


def _find_best_suggestion(
    observation: RetailPriceObservation,
    references: list[ProductReference],
) -> tuple[ProductReference, float] | None:
    observation_name = normalize_lookup_key(observation.product_name or observation.raw_product_name)
    if not observation_name:
        return None

    best: tuple[ProductReference, float] | None = None
    for reference in references:
        reference_name = normalize_lookup_key(reference.canonical_name)
        confidence = _token_overlap(observation_name, reference_name)
        if confidence < 0.65:
            continue
        if observation.brand:
            brand_confidence = _token_overlap(normalize_lookup_key(observation.brand), normalize_lookup_key(reference.brand))
            confidence = round((confidence * 0.75) + (brand_confidence * 0.25), 3)
        if best is None or confidence > best[1]:
            best = (reference, confidence)
    return best


def _token_overlap(left: str, right: str) -> float:
    left_tokens = {token for token in left.split(" ") if token}
    right_tokens = {token for token in right.split(" ") if token}
    if not left_tokens or not right_tokens:
        return 0.0
    shared = len(left_tokens & right_tokens)
    return round(shared / max(1, min(len(left_tokens), len(right_tokens))), 3)
