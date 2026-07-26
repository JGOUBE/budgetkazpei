from __future__ import annotations

import json
import time
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

import jwt
from jwt import InvalidTokenError

from .errors import ScannerApiError
from .settings import ScannerSettings


LEGACY_ALLOWED_ALGORITHMS = {"HS256"}
ASYMMETRIC_ALLOWED_ALGORITHMS = {"RS256", "ES256"}
ALL_ALLOWED_ALGORITHMS = LEGACY_ALLOWED_ALGORITHMS | ASYMMETRIC_ALLOWED_ALGORITHMS


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    user_id: str
    role: str | None = None
    access_token: str | None = None


class JwksCache:
    def __init__(
        self,
        *,
        jwks_url: str,
        ttl_seconds: int,
        fetcher: Callable[[str], dict[str, Any]] | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.jwks_url = jwks_url
        self.ttl_seconds = ttl_seconds
        self.fetcher = fetcher or self._default_fetcher
        self.clock = clock
        self._jwks: dict[str, Any] | None = None
        self._expires_at = 0.0

    @staticmethod
    def _default_fetcher(url: str) -> dict[str, Any]:
        with urllib.request.urlopen(url, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))

    def get_key(self, *, kid: str, alg: str) -> dict[str, Any]:
        key = self._find_key(kid=kid, alg=alg, refresh=False)
        if key is not None:
            return key
        key = self._find_key(kid=kid, alg=alg, refresh=True)
        if key is None:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )
        return key

    def _find_key(
        self,
        *,
        kid: str,
        alg: str,
        refresh: bool,
    ) -> dict[str, Any] | None:
        jwks = self._get_jwks(refresh=refresh)
        keys = jwks.get("keys")
        if not isinstance(keys, list):
            raise ScannerApiError(code="authentication_invalid", retryable=True)

        for key in keys:
            if not isinstance(key, dict):
                continue
            if key.get("kid") != kid:
                continue
            if key.get("alg") not in {None, alg}:
                continue
            key_ops = key.get("key_ops")
            if key_ops is not None and "verify" not in key_ops:
                continue
            kty = key.get("kty")
            if alg.startswith("RS") and kty != "RSA":
                continue
            if alg.startswith("ES") and kty != "EC":
                continue
            return key
        return None

    def _get_jwks(self, *, refresh: bool) -> dict[str, Any]:
        now = self.clock()
        if not refresh and self._jwks is not None and now < self._expires_at:
            return self._jwks

        self._jwks = self.fetcher(self.jwks_url)
        self._expires_at = now + self.ttl_seconds
        return self._jwks


class SupabaseJwtVerifier:
    def __init__(
        self,
        settings: ScannerSettings,
        *,
        jwks_fetcher: Callable[[str], dict[str, Any]] | None = None,
    ) -> None:
        self.settings = settings
        self._jwks_cache = (
            JwksCache(
                jwks_url=settings.resolved_jwks_url,
                ttl_seconds=settings.jwks_cache_ttl_seconds,
                fetcher=jwks_fetcher,
            )
            if settings.resolved_jwks_url
            else None
        )

    def verify_authorization(self, authorization: str | None) -> AuthenticatedUser:
        if self.settings.auth_mode == "disabled":
            token = None
            if authorization:
                scheme, _, raw_token = authorization.partition(" ")
                if scheme.lower() == "bearer" and raw_token.strip():
                    token = raw_token.strip()
            return AuthenticatedUser(
                user_id="local-dev",
                role="service",
                access_token=token,
            )

        token = self._extract_bearer_token(authorization)
        header = self._read_untrusted_header(token)
        alg = header.get("alg")

        if not isinstance(alg, str) or alg not in ALL_ALLOWED_ALGORITHMS:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )
        if alg in LEGACY_ALLOWED_ALGORITHMS:
            payload = self._verify_hs256(token)
        else:
            payload = self._verify_asymmetric(token, header, alg)

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )

        role = payload.get("role")
        if role != "authenticated":
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )

        return AuthenticatedUser(user_id=subject, role=role, access_token=token)

    @staticmethod
    def _extract_bearer_token(authorization: str | None) -> str:
        if not authorization:
            raise ScannerApiError(
                code="authentication_required",
                retryable=True,
            )
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )
        return token.strip()

    @staticmethod
    def _read_untrusted_header(token: str) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
        except InvalidTokenError as exc:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            ) from exc
        if not isinstance(header, dict):
            raise ScannerApiError(code="authentication_invalid", retryable=True)
        return header

    def _verify_hs256(self, token: str) -> dict[str, Any]:
        if not self.settings.supabase_jwt_secret:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )
        return self._decode(
            token,
            key=self.settings.supabase_jwt_secret,
            algorithms=["HS256"],
        )

    def _verify_asymmetric(
        self,
        token: str,
        header: dict[str, Any],
        alg: str,
    ) -> dict[str, Any]:
        if self._jwks_cache is None:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )
        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            )

        jwk_dict = self._jwks_cache.get_key(kid=kid, alg=alg)
        try:
            key = jwt.PyJWK.from_dict(jwk_dict, algorithm=alg).key
        except Exception as exc:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            ) from exc
        return self._decode(token, key=key, algorithms=[alg])

    def _decode(
        self,
        token: str,
        *,
        key: Any,
        algorithms: list[str],
    ) -> dict[str, Any]:
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=algorithms,
                audience=self.settings.expected_audience,
                issuer=self.settings.resolved_expected_issuer,
                options={
                    "require": ["exp", "iss", "aud", "sub", "role"],
                    "verify_aud": bool(self.settings.expected_audience),
                    "verify_iss": bool(self.settings.resolved_expected_issuer),
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_nbf": True,
                },
            )
        except InvalidTokenError as exc:
            raise ScannerApiError(
                code="authentication_invalid",
                retryable=True,
            ) from exc

        if not isinstance(payload, dict):
            raise ScannerApiError(code="authentication_invalid", retryable=True)
        return payload
