from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from .api.errors import ScannerApiError
from .api.settings import ScannerSettings


@dataclass(frozen=True, slots=True)
class QuotaReservation:
    allowed: bool
    reservation_id: str | None = None
    request_id: str | None = None
    status: str | None = None
    remaining: int | None = None
    limit: int | None = None
    plan: str | None = None
    idempotent: bool = False
    reason: str | None = None


class ScanQuotaProvider:
    def reserve_scan(
        self,
        *,
        user_id: str,
        mode: str,
        request_id: str,
        access_token: str | None,
    ) -> QuotaReservation:
        raise NotImplementedError

    def complete_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
    ) -> None:
        raise NotImplementedError

    def release_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
        reason: str,
    ) -> None:
        raise NotImplementedError


class NoopScanQuotaProvider(ScanQuotaProvider):
    def reserve_scan(
        self,
        *,
        user_id: str,
        mode: str,
        request_id: str,
        access_token: str | None,
    ) -> QuotaReservation:
        del user_id, mode, access_token
        return QuotaReservation(
            allowed=True,
            reservation_id=f"local:{request_id}",
            request_id=request_id,
            status="reserved",
            idempotent=False,
        )

    def complete_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
    ) -> None:
        del reservation, access_token

    def release_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
        reason: str,
    ) -> None:
        del reservation, access_token, reason


class SupabaseScanQuotaProvider(ScanQuotaProvider):
    def __init__(self, settings: ScannerSettings) -> None:
        if not settings.resolved_supabase_url or not settings.supabase_anon_key:
            raise ScannerApiError(code="quota_unavailable", retryable=True)
        self.settings = settings
        self.base_url = settings.resolved_supabase_url
        self.anon_key = settings.supabase_anon_key

    def reserve_scan(
        self,
        *,
        user_id: str,
        mode: str,
        request_id: str,
        access_token: str | None,
    ) -> QuotaReservation:
        del user_id
        payload = self._rpc(
            self.settings.quota_rpc_name,
            {
                "p_request_id": request_id,
                "p_scan_type": mode,
            },
            access_token=access_token,
        )
        reservation = _reservation_from_payload(payload, request_id=request_id)
        if not reservation.allowed:
            code = (
                "scan_safety_limit_reached"
                if reservation.reason == "scan_safety_limit_reached"
                else "monthly_quota_reached"
            )
            raise ScannerApiError(
                code=code,
                retryable=True,
                scan_id=request_id,
            )
        return reservation

    def complete_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
    ) -> None:
        if not reservation.reservation_id:
            return
        self._rpc(
            self.settings.quota_complete_rpc_name,
            {"p_reservation_id": reservation.reservation_id},
            access_token=access_token,
        )

    def release_scan(
        self,
        *,
        reservation: QuotaReservation,
        access_token: str | None,
        reason: str,
    ) -> None:
        if not reservation.reservation_id:
            return
        self._rpc(
            self.settings.quota_release_rpc_name,
            {
                "p_reservation_id": reservation.reservation_id,
                "p_reason": reason,
            },
            access_token=access_token,
        )

    def _rpc(
        self,
        name: str,
        payload: dict[str, object],
        *,
        access_token: str | None,
    ) -> dict[str, Any]:
        if not access_token:
            raise ScannerApiError(code="authentication_required", retryable=True)

        request = urllib.request.Request(
            f"{self.base_url}/rest/v1/rpc/{name}",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "apikey": self.anon_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(
                request,
                timeout=self.settings.quota_timeout_seconds,
            ) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise _map_supabase_error(exc.code, body) from exc
        except OSError as exc:
            raise ScannerApiError(code="quota_unavailable", retryable=True) from exc

        try:
            parsed = json.loads(body or "{}")
        except json.JSONDecodeError as exc:
            raise ScannerApiError(code="quota_unavailable", retryable=True) from exc

        if not isinstance(parsed, dict):
            raise ScannerApiError(code="quota_unavailable", retryable=True)
        return parsed


def build_quota_provider(settings: ScannerSettings) -> ScanQuotaProvider:
    if settings.quota_mode == "disabled" or settings.auth_mode == "disabled":
        return NoopScanQuotaProvider()
    if not settings.resolved_supabase_url or not settings.supabase_anon_key:
        if settings.env != "production":
            return NoopScanQuotaProvider()
        raise ScannerApiError(code="quota_unavailable", retryable=True)
    return SupabaseScanQuotaProvider(settings)


def _reservation_from_payload(
    payload: dict[str, Any],
    *,
    request_id: str,
) -> QuotaReservation:
    return QuotaReservation(
        allowed=payload.get("allowed") is True,
        reservation_id=_string_or_none(payload.get("reservation_id")),
        request_id=_string_or_none(payload.get("request_id")) or request_id,
        status=_string_or_none(payload.get("status")),
        remaining=_int_or_none(payload.get("remaining")),
        limit=_int_or_none(payload.get("limit")),
        plan=_string_or_none(payload.get("plan")),
        idempotent=payload.get("idempotent") is True,
        reason=_string_or_none(payload.get("reason")),
    )


def _map_supabase_error(status: int, body: str) -> ScannerApiError:
    lowered = body.lower()
    if status in {401, 403}:
        return ScannerApiError(code="authentication_invalid", retryable=True)
    if status == 429 or "quota" in lowered:
        code = "scan_safety_limit_reached" if "scan_safety_limit_reached" in lowered else "monthly_quota_reached"
        return ScannerApiError(code=code, retryable=True)
    return ScannerApiError(code="quota_unavailable", retryable=True)


def _string_or_none(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _int_or_none(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None
