from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Protocol

from .api.settings import ScannerSettings
from .receipt_parser_fr import ParsedReceipt


logger = logging.getLogger("receipt_scanner.api")

MAX_ITEMS = 120
MAX_NAME_LENGTH = 180
OCR_FOOD_CONTEXT_TOKENS = {
    "tarama",
    "cabillaud",
    "oeuf",
    "oeufs",
    "nouille",
    "nouilles",
    "pate",
    "pates",
    "ravioli",
    "quiche",
    "cake",
    "surimi",
    "thon",
    "mayonnaise",
    "poisson",
}


class MarketProductResolver(Protocol):
    def enrich(
        self,
        receipt: ParsedReceipt,
        *,
        access_token: str | None,
    ) -> dict[str, object]:
        ...


class NoopMarketProductResolver:
    def enrich(
        self,
        receipt: ParsedReceipt,
        *,
        access_token: str | None,
    ) -> dict[str, object]:
        del receipt, access_token
        return {
            "requested": 0,
            "resolved": 0,
            "skipped": True,
        }


class SupabaseMarketProductResolver:
    def __init__(self, settings: ScannerSettings) -> None:
        self.base_url = settings.resolved_supabase_url
        self.anon_key = settings.supabase_anon_key
        self.timeout_seconds = settings.quota_timeout_seconds

    def enrich(
        self,
        receipt: ParsedReceipt,
        *,
        access_token: str | None,
    ) -> dict[str, object]:
        if not self.base_url or not self.anon_key or not access_token:
            return {
                "requested": 0,
                "resolved": 0,
                "skipped": True,
            }

        payload_items: list[dict[str, object]] = []

        for index, item in enumerate(receipt.items[:MAX_ITEMS]):
            raw_name = _clean_text(
                item.raw_name,
                MAX_NAME_LENGTH,
            )
            if not raw_name:
                continue

            observed_price = _positive_price(
                item.total_price
                if item.total_price is not None
                else item.unit_price
            )

            payload_items.append(
                {
                    "index": index,
                    "raw_name": raw_name,
                    "barcode": None,
                    "observed_price": observed_price,
                    "brand": "",
                    "package_format": "",
                    "alternate_names": _build_ocr_alias_alternate_names(raw_name),
                }
            )

        if not payload_items:
            return {
                "requested": 0,
                "resolved": 0,
                "skipped": True,
            }

        payload = {
            "items": payload_items,
            "context": {
                "store_name": _clean_text(receipt.store_name, 120),
                "store_city": _clean_text(receipt.store_location, 80),
                "observed_date": _clean_date(receipt.receipt_date),
            },
        }

        request = urllib.request.Request(
            f"{self.base_url}/functions/v1/market-resolve-products",
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
                timeout=self.timeout_seconds,
            ) as response:
                body = response.read().decode("utf-8")

            parsed = json.loads(body or "{}")
            if not isinstance(parsed, dict) or parsed.get("ok") is not True:
                raise ValueError("invalid_market_resolver_response")

            resolutions = parsed.get("items")
            if not isinstance(resolutions, list):
                resolutions = []

            resolved_count = self._apply_resolutions(
                receipt,
                resolutions,
            )

            logger.info(
                "market_resolver_success",
                extra={
                    "requested_count": len(payload_items),
                    "resolved_count": resolved_count,
                },
            )

            return {
                "requested": len(payload_items),
                "resolved": resolved_count,
                "unresolved": len(payload_items) - resolved_count,
                "skipped": False,
            }

        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            OSError,
            json.JSONDecodeError,
            TypeError,
            ValueError,
        ) as exc:
            logger.warning(
                "market_resolver_failed",
                extra={
                    "requested_count": len(payload_items),
                    "reason": type(exc).__name__,
                },
            )

            return {
                "requested": len(payload_items),
                "resolved": 0,
                "unresolved": len(payload_items),
                "failed": True,
            }

    @staticmethod
    def _apply_resolutions(
        receipt: ParsedReceipt,
        resolutions: list[object],
    ) -> int:
        resolved_count = 0

        for value in resolutions:
            if not isinstance(value, dict):
                continue
            if value.get("market_matched") is not True:
                continue

            try:
                index = int(value.get("index"))
            except (TypeError, ValueError):
                continue

            if index < 0 or index >= len(receipt.items):
                continue

            canonical_name = _clean_text(
                value.get("market_canonical_name"),
                MAX_NAME_LENGTH,
            )
            if not canonical_name:
                continue

            item = receipt.items[index]
            item.canonical_name = canonical_name
            item.match_type = (
                _clean_text(value.get("market_match_type"), 80) or None
            )

            confidence = value.get("market_match_confidence")
            try:
                item.match_confidence = (
                    float(confidence) if confidence is not None else None
                )
            except (TypeError, ValueError):
                item.match_confidence = None

            resolved_count += 1

        return resolved_count


def build_market_product_resolver(
    settings: ScannerSettings,
) -> MarketProductResolver:
    if settings.resolved_supabase_url and settings.supabase_anon_key:
        return SupabaseMarketProductResolver(settings)

    return NoopMarketProductResolver()


def _clean_text(value: object, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _clean_date(value: object) -> str | None:
    raw = str(value or "").strip()
    return raw if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw) else None


def _positive_price(value: object) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None

    if price <= 0 or price > 100_000:
        return None

    return round(price, 2)


def _build_ocr_alias_alternate_names(value: object) -> list[str]:
    raw = _clean_text(value, MAX_NAME_LENGTH)
    if not raw:
        return []

    variants: list[str] = []

    normalized_unit_variant = re.sub(
        r"\b([iIlL1][oO0]{2})(kg|gr|g|ml|cl|l)\b",
        lambda match: f"100{match.group(2).upper()}",
        raw,
        flags=re.IGNORECASE,
    )
    if normalized_unit_variant != raw:
        variants.append(normalized_unit_variant)

    has_food_context = any(
        token in OCR_FOOD_CONTEXT_TOKENS
        for token in re.findall(r"[a-z0-9]+", raw.lower())
    )
    if has_food_context:
        oeufs_variant = re.sub(
            r"\b(?:DEUFS|CEUFS|0EUFS)\b",
            "OEUFS",
            raw,
            flags=re.IGNORECASE,
        )
        if oeufs_variant != raw:
            variants.append(oeufs_variant)

        combined_variant = re.sub(
            r"\b([iIlL1][oO0]{2})(kg|gr|g|ml|cl|l)\b",
            lambda match: f"100{match.group(2).upper()}",
            oeufs_variant,
            flags=re.IGNORECASE,
        )
        if combined_variant != raw and combined_variant != oeufs_variant:
            variants.append(combined_variant)

    unique_variants: list[str] = []
    seen: set[str] = set()
    for candidate in variants:
        key = _clean_text(candidate, MAX_NAME_LENGTH).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique_variants.append(candidate[:MAX_NAME_LENGTH])
        if len(unique_variants) >= 4:
            break

    return unique_variants
