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
