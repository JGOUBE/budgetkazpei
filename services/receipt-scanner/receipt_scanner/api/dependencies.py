from __future__ import annotations

from fastapi import Header, Request

from .security import AuthenticatedUser, SupabaseJwtVerifier
from .settings import ScannerSettings, load_settings


def get_settings() -> ScannerSettings:
    return load_settings(validate=True)


def get_verifier(settings: ScannerSettings | None = None) -> SupabaseJwtVerifier:
    return SupabaseJwtVerifier(settings or get_settings())


async def require_user(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> AuthenticatedUser:
    verifier = getattr(request.app.state, "auth_verifier", None)
    if verifier is None:
        verifier = get_verifier()
    return verifier.verify_authorization(authorization)


def get_scan_service(request: Request):
    return request.app.state.scan_service
