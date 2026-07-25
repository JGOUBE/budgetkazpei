from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


@dataclass(frozen=True)
class Settings:
    supabase_url: str | None
    supabase_service_role_key: str | None
    collector_mode: str
    collector_dry_run: bool
    collector_source_slug: str | None
    collector_max_sources: int
    collector_max_documents: int
    collector_request_timeout_seconds: int
    collector_ocr_enabled: bool
    collector_ocr_max_pages: int
    collector_log_level: str
    collector_timezone: str
    collector_temp_dir: Path
    collector_max_pdf_pages: int
    collector_max_parallel_requests: int
    collector_domain_delay_seconds: float
    collector_user_agent: str

    @classmethod
    def from_env(cls) -> "Settings":
        temp_dir = Path(os.getenv("COLLECTOR_TEMP_DIR", tempfile.gettempdir())) / "budgetkazpei-good-deals"
        return cls(
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            collector_mode=os.getenv("COLLECTOR_MODE", "full").strip().lower(),
            collector_dry_run=_env_bool("COLLECTOR_DRY_RUN", False),
            collector_source_slug=(os.getenv("COLLECTOR_SOURCE_SLUG") or "").strip() or None,
            collector_max_sources=_env_int("COLLECTOR_MAX_SOURCES", 25),
            collector_max_documents=_env_int("COLLECTOR_MAX_DOCUMENTS", 40),
            collector_request_timeout_seconds=_env_int("COLLECTOR_REQUEST_TIMEOUT_SECONDS", 30),
            collector_ocr_enabled=_env_bool("COLLECTOR_OCR_ENABLED", True),
            collector_ocr_max_pages=_env_int("COLLECTOR_OCR_MAX_PAGES", 20),
            collector_log_level=os.getenv("COLLECTOR_LOG_LEVEL", "INFO").upper(),
            collector_timezone=os.getenv("COLLECTOR_TIMEZONE", "Indian/Reunion"),
            collector_temp_dir=temp_dir,
            collector_max_pdf_pages=_env_int("COLLECTOR_MAX_PDF_PAGES", 20),
            collector_max_parallel_requests=_env_int("COLLECTOR_MAX_PARALLEL_REQUESTS", 1),
            collector_domain_delay_seconds=float(os.getenv("COLLECTOR_DOMAIN_DELAY_SECONDS", "2.0")),
            collector_user_agent=os.getenv(
                "COLLECTOR_USER_AGENT",
                "BudgetKazPeiGoodDealsCollector/0.1 (+https://budgetkazpei.app)",
            ),
        )

    def with_overrides(
        self,
        *,
        collector_mode: str | None = None,
        collector_dry_run: bool | None = None,
        collector_source_slug: str | None = None,
        collector_max_sources: int | None = None,
    ) -> "Settings":
        return replace(
            self,
            collector_mode=collector_mode or self.collector_mode,
            collector_dry_run=self.collector_dry_run if collector_dry_run is None else collector_dry_run,
            collector_source_slug=self.collector_source_slug if collector_source_slug is None else collector_source_slug,
            collector_max_sources=self.collector_max_sources if collector_max_sources is None else collector_max_sources,
        )
