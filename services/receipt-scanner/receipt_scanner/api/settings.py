from __future__ import annotations

import os
from dataclasses import dataclass


def _int_env(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    value = int(raw)
    if value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    return value


def _float_env(name: str, default: float, *, minimum: float = 0.1) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    value = float(raw)
    if value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    return value


@dataclass(frozen=True, slots=True)
class ScannerSettings:
    env: str = "development"
    auth_mode: str = "required"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_jwt_secret: str | None = None
    supabase_jwks_url: str | None = None
    jwks_cache_ttl_seconds: int = 600
    expected_audience: str | None = "authenticated"
    expected_issuer: str | None = None
    max_file_size_mb: int = 12
    max_total_file_size_mb: int = 24
    min_image_width: int = 120
    min_image_height: int = 120
    max_image_pixels: int = 45_000_000
    max_concurrent_scans: int = 1
    scanner_busy_timeout_seconds: float = 2.0
    processing_timeout_seconds: float = 90.0
    diagnostics_enabled: bool = True
    temp_parent_dir: str | None = None
    quota_mode: str = "supabase"
    quota_rpc_name: str = "reserve_receipt_scan"
    quota_complete_rpc_name: str = "complete_receipt_scan"
    quota_release_rpc_name: str = "release_receipt_scan"
    quota_timeout_seconds: float = 5.0
    idempotency_cache_ttl_seconds: int = 900

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def max_total_file_size_bytes(self) -> int:
        return self.max_total_file_size_mb * 1024 * 1024

    @property
    def auth_disabled_in_production(self) -> bool:
        return self.env == "production" and self.auth_mode == "disabled"

    @property
    def resolved_supabase_url(self) -> str | None:
        if not self.supabase_url:
            return None
        return self.supabase_url.rstrip("/")

    @property
    def resolved_jwks_url(self) -> str | None:
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        if self.resolved_supabase_url:
            return f"{self.resolved_supabase_url}/auth/v1/.well-known/jwks.json"
        return None

    @property
    def resolved_expected_issuer(self) -> str | None:
        if self.expected_issuer:
            return self.expected_issuer.rstrip("/")
        if self.resolved_supabase_url:
            return f"{self.resolved_supabase_url}/auth/v1"
        return None

    def validate(self) -> None:
        if self.auth_disabled_in_production:
            raise RuntimeError(
                "RECEIPT_SCANNER_AUTH_MODE=disabled is not allowed in production"
            )
        if self.auth_mode not in {"required", "disabled"}:
            raise ValueError("RECEIPT_SCANNER_AUTH_MODE must be required or disabled")
        if self.auth_mode == "required" and not (
            self.supabase_jwt_secret or self.resolved_jwks_url
        ):
            raise ValueError(
                "Configure RECEIPT_SCANNER_SUPABASE_JWT_SECRET or "
                "RECEIPT_SCANNER_SUPABASE_URL/JWKS_URL when auth is required"
            )
        if self.auth_mode == "required" and not self.resolved_expected_issuer:
            raise ValueError(
                "Configure RECEIPT_SCANNER_EXPECTED_ISSUER or "
                "RECEIPT_SCANNER_SUPABASE_URL when auth is required"
            )
        if self.quota_mode not in {"supabase", "disabled"}:
            raise ValueError("RECEIPT_SCANNER_QUOTA_MODE must be supabase or disabled")
        if self.env == "production" and self.quota_mode == "disabled":
            raise RuntimeError(
                "RECEIPT_SCANNER_QUOTA_MODE=disabled is not allowed in production"
            )
        if self.auth_mode == "required" and self.quota_mode == "supabase" and not (
            self.resolved_supabase_url and self.supabase_anon_key
        ):
            raise ValueError(
                "Configure RECEIPT_SCANNER_SUPABASE_URL and "
                "RECEIPT_SCANNER_SUPABASE_ANON_KEY when quota is enabled"
            )


def load_settings(*, validate: bool = True) -> ScannerSettings:
    settings = ScannerSettings(
        env=os.environ.get("ENV", "development").strip().lower() or "development",
        auth_mode=os.environ.get(
            "RECEIPT_SCANNER_AUTH_MODE",
            "required",
        ).strip().lower() or "required",
        supabase_url=os.environ.get("RECEIPT_SCANNER_SUPABASE_URL"),
        supabase_anon_key=os.environ.get("RECEIPT_SCANNER_SUPABASE_ANON_KEY"),
        supabase_jwt_secret=os.environ.get("RECEIPT_SCANNER_SUPABASE_JWT_SECRET"),
        supabase_jwks_url=os.environ.get("RECEIPT_SCANNER_SUPABASE_JWKS_URL"),
        jwks_cache_ttl_seconds=_int_env(
            "RECEIPT_SCANNER_JWKS_CACHE_TTL_SECONDS",
            600,
        ),
        expected_audience=os.environ.get(
            "RECEIPT_SCANNER_EXPECTED_AUDIENCE",
            os.environ.get("RECEIPT_SCANNER_SUPABASE_JWT_AUDIENCE", "authenticated"),
        ),
        expected_issuer=os.environ.get(
            "RECEIPT_SCANNER_EXPECTED_ISSUER",
        ),
        max_file_size_mb=_int_env("RECEIPT_SCANNER_MAX_FILE_SIZE_MB", 12),
        max_total_file_size_mb=_int_env(
            "RECEIPT_SCANNER_MAX_TOTAL_FILE_SIZE_MB",
            24,
        ),
        min_image_width=_int_env("RECEIPT_SCANNER_MIN_IMAGE_WIDTH", 120),
        min_image_height=_int_env("RECEIPT_SCANNER_MIN_IMAGE_HEIGHT", 120),
        max_image_pixels=_int_env(
            "RECEIPT_SCANNER_MAX_IMAGE_PIXELS",
            45_000_000,
        ),
        max_concurrent_scans=_int_env(
            "RECEIPT_SCANNER_MAX_CONCURRENT_SCANS",
            1,
        ),
        scanner_busy_timeout_seconds=_float_env(
            "RECEIPT_SCANNER_BUSY_TIMEOUT_SECONDS",
            2.0,
        ),
        processing_timeout_seconds=_float_env(
            "RECEIPT_SCANNER_PROCESSING_TIMEOUT_SECONDS",
            90.0,
        ),
        diagnostics_enabled=os.environ.get(
            "RECEIPT_SCANNER_DIAGNOSTICS_ENABLED",
            "true",
        ).strip().lower() not in {"0", "false", "no"},
        temp_parent_dir=os.environ.get("RECEIPT_SCANNER_TEMP_DIR"),
        quota_mode=os.environ.get(
            "RECEIPT_SCANNER_QUOTA_MODE",
            "supabase",
        ).strip().lower() or "supabase",
        quota_rpc_name=os.environ.get(
            "RECEIPT_SCANNER_QUOTA_RESERVE_RPC",
            "reserve_receipt_scan",
        ).strip() or "reserve_receipt_scan",
        quota_complete_rpc_name=os.environ.get(
            "RECEIPT_SCANNER_QUOTA_COMPLETE_RPC",
            "complete_receipt_scan",
        ).strip() or "complete_receipt_scan",
        quota_release_rpc_name=os.environ.get(
            "RECEIPT_SCANNER_QUOTA_RELEASE_RPC",
            "release_receipt_scan",
        ).strip() or "release_receipt_scan",
        quota_timeout_seconds=_float_env(
            "RECEIPT_SCANNER_QUOTA_TIMEOUT_SECONDS",
            5.0,
        ),
        idempotency_cache_ttl_seconds=_int_env(
            "RECEIPT_SCANNER_IDEMPOTENCY_CACHE_TTL_SECONDS",
            900,
        ),
    )
    if validate:
        settings.validate()
    return settings
