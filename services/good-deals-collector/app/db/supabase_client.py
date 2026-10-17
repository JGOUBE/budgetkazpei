from __future__ import annotations

import json
import urllib.parse
import urllib.request
from urllib.error import HTTPError


class SupabaseAdminClient:
    def __init__(self, base_url: str, service_role_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_role_key = service_role_key

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str] | None = None,
        payload: dict[str, object] | list[dict[str, object]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> list[dict[str, object]]:
        url = f"{self.base_url}/rest/v1/{path.lstrip('/')}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
        request_headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        if headers:
            request_headers.update(headers)
        body = None if payload is None else json.dumps(payload, ensure_ascii=True).encode("utf-8")
        request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read().decode("utf-8")
                if not data:
                    return []
                return json.loads(data)
        except HTTPError as exc:
            # Keep request credentials and data out of diagnostic logs.
            try:
                body = json.loads(exc.read(4096).decode("utf-8", errors="replace"))
                diagnostic = {
                    key: str(body[key])[:300]
                    for key in ("code", "message", "hint")
                    if isinstance(body, dict) and body.get(key) is not None
                }
            except (ValueError, UnicodeError):
                diagnostic = {}
            raise RuntimeError(
                f"supabase_http_error method={method} table={path.split('/')[0]} "
                f"status={exc.code} diagnostic={json.dumps(diagnostic, ensure_ascii=True)}"
            ) from None

    def select(self, table: str, *, filters: dict[str, str] | None = None, columns: str = "*") -> list[dict[str, object]]:
        query = {"select": columns}
        if filters:
            query.update(filters)
        return self._request("GET", table, query=query)

    def upsert(self, table: str, rows: list[dict[str, object]], *, on_conflict: str) -> list[dict[str, object]]:
        return self._request(
            "POST",
            table,
            query={"on_conflict": on_conflict},
            payload=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )

    def insert(self, table: str, rows: list[dict[str, object]]) -> list[dict[str, object]]:
        return self._request("POST", table, payload=rows)

    def patch(self, table: str, *, filters: dict[str, str], values: dict[str, object]) -> list[dict[str, object]]:
        return self._request("PATCH", table, query=filters, payload=values)
