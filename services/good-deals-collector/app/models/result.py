from __future__ import annotations

from dataclasses import dataclass, field

from .candidate import Candidate


@dataclass
class SourceProcessingResult:
    source_slug: str
    changed: bool
    candidates: list[Candidate] = field(default_factory=list)
    skipped_reason: str | None = None
    error_message: str | None = None


@dataclass
class RunSummary:
    run_key: str
    status: str
    sources_total: int = 0
    sources_checked: int = 0
    sources_changed: int = 0
    documents_processed: int = 0
    candidates_detected: int = 0
    candidates_published: int = 0
    candidates_needing_review: int = 0
    duplicates_detected: int = 0
    rejected_count: int = 0
    expired_count: int = 0
    errors_count: int = 0
    error_summary: list[dict[str, str]] = field(default_factory=list)
    metrics: dict[str, int | bool] = field(default_factory=dict)


@dataclass
class ExpirationMaintenanceResult:
    dry_run: bool
    good_deals: int = 0
    promotions: int = 0
    catalogs: int = 0
    candidates: int = 0

    def as_metrics(self) -> dict[str, int | bool]:
        if self.dry_run:
            return {
                "expiration_dry_run": True,
                "good_deals_would_expire": self.good_deals,
                "promotions_would_expire": self.promotions,
                "catalogs_would_expire": self.catalogs,
                "candidates_would_expire": self.candidates,
            }
        return {
            "expiration_dry_run": False,
            "good_deals_expired": self.good_deals,
            "promotions_expired": self.promotions,
            "catalogs_expired": self.catalogs,
            "candidates_expired": self.candidates,
        }


@dataclass
class ApprovedPublicationResult:
    pending: int = 0
    published: int = 0
    failed: int = 0

    def as_metrics(self) -> dict[str, int]:
        return {
            "approved_candidates_pending": self.pending,
            "approved_candidates_published": self.published,
            "approved_candidates_failed": self.failed,
        }
