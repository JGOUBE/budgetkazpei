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
    source_slug: str
    source_url: str
    official_domain: str
    retailer_slug: str
    target_catalog_slug: str
    dry_run: bool
    max_catalogs: int
    max_pages: int
    request_timeout_seconds: int
    domain_delay_seconds: float
    user_agent: str
    extraction_version: str
    extraction_mode: str
    vision_enabled: bool
    report_path: Path
    layout_report_path: Path
    ocr_python_executable: Path
    classification_max_dimension: int
    selected_page_numbers: tuple[int, ...]
    temp_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        repo_root = Path(__file__).resolve().parents[3]
        temp_dir = Path(os.getenv("PROMO_COLLECTOR_TEMP_DIR", tempfile.gettempdir())) / "budgetkazpei-promo-products"
        default_report_path = repo_root / "reports" / "promo-products-eleclerc-26runrdc-pages-1-3.json"
        default_layout_report_path = repo_root / "reports" / "promo-products-eleclerc-26runrdc-layouts.json"
        max_pages = _env_int("PROMO_MAX_PAGES", _env_int("PROMO_COLLECTOR_MAX_PAGES", 0))
        return cls(
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            source_slug="e-leclerc-reunion-catalogues",
            source_url=os.getenv(
                "PROMO_COLLECTOR_SOURCE_URL",
                "https://www.e-leclerc.re/index.php/page/catalogues-reunion",
            ),
            official_domain=os.getenv("PROMO_COLLECTOR_OFFICIAL_DOMAIN", "e-leclerc.re"),
            retailer_slug=os.getenv("PROMO_COLLECTOR_RETAILER_SLUG", "eleclerc-reunion"),
            target_catalog_slug=os.getenv("PROMO_COLLECTOR_TARGET_CATALOG", os.getenv("PROMO_TARGET_CATALOG", "26runRDC")),
            dry_run=_env_bool("PROMO_COLLECTOR_DRY_RUN", True),
            max_catalogs=_env_int("PROMO_COLLECTOR_MAX_CATALOGS", 1),
            max_pages=max_pages,
            request_timeout_seconds=_env_int("PROMO_COLLECTOR_REQUEST_TIMEOUT_SECONDS", 30),
            domain_delay_seconds=float(os.getenv("PROMO_COLLECTOR_DOMAIN_DELAY_SECONDS", "1.0")),
            user_agent=os.getenv(
                "PROMO_COLLECTOR_USER_AGENT",
                "BudgetKazPeiPromoProductsCollector/0.1 (+https://budgetkazpei.app)",
            ),
            extraction_version=os.getenv("PROMO_COLLECTOR_EXTRACTION_VERSION", "fliphtml5_pages_v1"),
            extraction_mode=os.getenv("PROMO_EXTRACTION_MODE", "local").strip().lower(),
            vision_enabled=_env_bool("PROMO_VISION_ENABLED", False),
            report_path=Path(os.getenv("PROMO_REPORT_PATH", str(default_report_path))),
            layout_report_path=Path(os.getenv("PROMO_LAYOUT_REPORT_PATH", str(default_layout_report_path))),
            ocr_python_executable=Path(
                os.getenv(
                    "PROMO_OCR_PYTHON",
                    str(repo_root / "services" / "receipt-scanner" / ".venv" / "Scripts" / "python.exe"),
                )
            ),
            classification_max_dimension=_env_int("PROMO_CLASSIFICATION_MAX_DIMENSION", 480),
            selected_page_numbers=_env_page_numbers("PROMO_SELECTED_PAGE_NUMBERS"),
            temp_dir=temp_dir,
        )

    def with_overrides(
        self,
        *,
        dry_run: bool | None = None,
        max_catalogs: int | None = None,
        max_pages: int | None = None,
        target_catalog_slug: str | None = None,
        report_path: Path | None = None,
        layout_report_path: Path | None = None,
        selected_page_numbers: tuple[int, ...] | None = None,
    ) -> "Settings":
        return replace(
            self,
            dry_run=self.dry_run if dry_run is None else dry_run,
            max_catalogs=self.max_catalogs if max_catalogs is None else max_catalogs,
            max_pages=self.max_pages if max_pages is None else max_pages,
            target_catalog_slug=self.target_catalog_slug if target_catalog_slug is None else target_catalog_slug,
            report_path=self.report_path if report_path is None else report_path,
            layout_report_path=self.layout_report_path if layout_report_path is None else layout_report_path,
            selected_page_numbers=self.selected_page_numbers if selected_page_numbers is None else selected_page_numbers,
        )


def _env_page_numbers(name: str) -> tuple[int, ...]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return ()
    values: list[int] = []
    for token in raw.split(","):
        cleaned = token.strip()
        if cleaned:
            values.append(int(cleaned))
    return tuple(values)
