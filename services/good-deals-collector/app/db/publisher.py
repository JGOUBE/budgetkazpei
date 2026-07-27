from __future__ import annotations

from datetime import datetime, timezone

from app.models.candidate import Candidate
from app.services.normalization import normalize_text

from .repositories import RepositoryProtocol


class PublisherService:
    def __init__(self, repositories: RepositoryProtocol) -> None:
        self.repositories = repositories

    def publish_candidate(self, candidate: Candidate, *, force: bool = False) -> str | None:
        if candidate.status not in {"approved", "published"} and not force:
            return None
        if candidate.status == "published" and candidate.published_good_deal_id:
            return candidate.published_good_deal_id

        now = datetime.now(timezone.utc).isoformat()
        business_id = self.repositories.upsert_business(
            {
                "name": candidate.business_name or candidate.organizer_name,
                "slug": candidate.retailer_slug or normalize_text(candidate.business_name or candidate.organizer_name or candidate.title).replace(" ", "-"),
                "commune": candidate.commune,
                "website_url": candidate.source_url,
                "category": candidate.category or candidate.content_family,
                "is_verified": True,
                "is_active": True,
                "updated_at": now,
            }
        )

        published_good_deal_id: str | None
        if candidate.content_kind == "promotion":
            catalog_candidate = self._is_catalog_candidate(candidate)
            product_promotion_candidate = self._is_product_promotion_candidate(candidate)
            store_location_id = self.repositories.upsert_store_location(
                {
                    "retailer_slug": candidate.retailer_slug,
                    "retailer_name": candidate.business_name,
                    "store_name": candidate.business_name or candidate.retailer_slug,
                    "commune": candidate.commune,
                    "locality": candidate.locality,
                    "website_url": candidate.source_url,
                    "is_active": True,
                    "updated_at": now,
                }
            )

            product_id = None
            if product_promotion_candidate:
                product_id = self.repositories.upsert_product(
                    {
                        "normalized_name": candidate.normalized_product_name,
                        "display_name": candidate.product_name,
                        "brand": candidate.brand,
                        "size_label": candidate.size_label,
                        "category": candidate.category or "shopping",
                        "is_active": True,
                        "updated_at": now,
                    }
                )

                if product_id and candidate.product_name:
                    self.repositories.upsert_product_alias(
                        {
                            "product_id": product_id,
                            "alias_text": candidate.product_name,
                            "normalized_alias": normalize_text(candidate.product_name),
                            "source_kind": "collector",
                            "retailer_slug": candidate.retailer_slug,
                            "confidence_score": min(candidate.confidence_score / 100, 1),
                        }
                    )

            catalog_id = None
            if catalog_candidate or product_promotion_candidate:
                catalog_id = self.repositories.upsert_catalog(
                    {
                        "external_key": candidate.external_key,
                        "collector_source_slug": candidate.source_slug,
                        "retailer_slug": candidate.retailer_slug,
                        "retailer_name": candidate.business_name,
                        "title": candidate.title,
                        "description": candidate.description,
                        "scope_type": candidate.scope_type,
                        "commune": candidate.commune,
                        "micro_region": candidate.micro_region,
                        "store_location_id": store_location_id,
                        "starts_at": candidate.starts_at.isoformat() if candidate.starts_at else None,
                        "ends_at": candidate.ends_at.isoformat() if candidate.ends_at else None,
                        "source_url": candidate.source_url,
                        "source_kind": "collector",
                        "verification_status": "published",
                        "is_featured": False,
                        "is_active": True,
                        "updated_at": now,
                    }
                )

            if product_promotion_candidate:
                self.repositories.upsert_promotion(
                    {
                        "external_key": candidate.external_key,
                        "collector_source_slug": candidate.source_slug,
                        "catalog_id": catalog_id,
                        "product_id": product_id,
                        "store_location_id": store_location_id,
                        "retailer_slug": candidate.retailer_slug,
                        "title": candidate.title,
                        "offer_text": candidate.description,
                        "promo_price": candidate.promo_price,
                        "original_price": candidate.original_price,
                        "discount_percent": candidate.discount_percent,
                        "unit_price": candidate.unit_price,
                        "unit_label": candidate.unit_label,
                        "conditions": candidate.price_note,
                        "starts_at": candidate.starts_at.isoformat() if candidate.starts_at else None,
                        "ends_at": candidate.ends_at.isoformat() if candidate.ends_at else None,
                        "source_url": candidate.source_url,
                        "source_page": candidate.source_page,
                        "verification_status": "published",
                        "is_featured": False,
                        "is_active": True,
                        "updated_at": now,
                    }
                )

        published_good_deal_id = self.repositories.upsert_good_deal(
            {
                "external_key": candidate.external_key,
                "collector_source_slug": candidate.source_slug,
                "collector_candidate_external_key": candidate.external_key,
                "business_id": business_id,
                "title": candidate.title,
                "description": candidate.description,
                "category": candidate.category or candidate.content_family,
                "scope_type": candidate.scope_type,
                "commune": candidate.commune,
                "micro_region": candidate.micro_region,
                "starts_at": candidate.starts_at.isoformat() if candidate.starts_at else None,
                "ends_at": candidate.ends_at.isoformat() if candidate.ends_at else None,
                "source_url": candidate.source_url,
                "verification_status": "published",
                "deal_type": self._resolve_deal_type(candidate),
                "tags": candidate.tags,
                "is_free": candidate.is_free,
                "conditions": candidate.price_note,
                "price_note": candidate.price_note,
                "content_kind": candidate.content_kind,
                "locality": candidate.locality,
                "territory_name": candidate.territory_name,
                "availability_status": self._resolve_availability_status(candidate),
                "last_verified_at": candidate.detected_at.isoformat() if candidate.detected_at else None,
                "source_still_available": True,
                "next_check_at": None if candidate.content_kind == "permanent_leisure" else candidate.ends_at.isoformat() if candidate.ends_at else None,
                "is_active": True,
                "updated_at": now,
            }
        )
        self.repositories.mark_candidate(candidate, status="published", published_good_deal_id=published_good_deal_id)
        return published_good_deal_id

    @staticmethod
    def _resolve_deal_type(candidate: Candidate) -> str:
        if candidate.content_kind == "promotion":
            return "promotion"
        if candidate.content_kind == "event":
            return "event"
        return "free_activity" if candidate.is_free else "local_service"

    @staticmethod
    def _resolve_availability_status(candidate: Candidate) -> str:
        if candidate.content_kind == "permanent_leisure":
            return "open"
        return "active"

    @staticmethod
    def _is_catalog_candidate(candidate: Candidate) -> bool:
        tags = {normalize_text(tag) for tag in candidate.tags if tag}
        return candidate.content_kind == "promotion" and ("catalog" in tags or "catalogue" in tags)

    @classmethod
    def _is_product_promotion_candidate(cls, candidate: Candidate) -> bool:
        return (
            candidate.content_kind == "promotion"
            and not cls._is_catalog_candidate(candidate)
            and bool(candidate.product_name or candidate.normalized_product_name)
        )
