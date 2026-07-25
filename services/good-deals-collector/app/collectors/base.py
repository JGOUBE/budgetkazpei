from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from app.config import Settings
from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.hashing import sha256_bytes


@dataclass
class HttpResponse:
    status_code: int
    url: str
    content: bytes
    headers: dict[str, str]


class HttpFetcher:
    def __init__(self) -> None:
        self._last_domain_fetch: dict[str, float] = {}

    def fetch(self, source: SourceDefinition, settings: Settings) -> HttpResponse:
        domain = source.official_domain
        now = time.monotonic()
        last_fetch = self._last_domain_fetch.get(domain)
        if last_fetch is not None:
            delta = now - last_fetch
            if delta < settings.collector_domain_delay_seconds:
                time.sleep(settings.collector_domain_delay_seconds - delta)
        self._last_domain_fetch[domain] = time.monotonic()
        try:
            import httpx  # type: ignore

            response = httpx.get(
                source.source_url,
                headers={"User-Agent": settings.collector_user_agent},
                timeout=settings.collector_request_timeout_seconds,
                follow_redirects=True,
            )
            return HttpResponse(
                status_code=response.status_code,
                url=str(response.url),
                content=response.content,
                headers={key.lower(): value for key, value in response.headers.items()},
            )
        except ModuleNotFoundError:
            request = urllib.request.Request(source.source_url, headers={"User-Agent": settings.collector_user_agent})
            try:
                with urllib.request.urlopen(request, timeout=settings.collector_request_timeout_seconds) as response:
                    content = response.read()
                    headers = {key.lower(): value for key, value in response.headers.items()}
                    status_code = getattr(response, "status", 200)
                    final_url = getattr(response, "url", source.source_url)
                    return HttpResponse(status_code=status_code, url=final_url, content=content, headers=headers)
            except urllib.error.HTTPError as exc:
                return HttpResponse(
                    status_code=exc.code,
                    url=source.source_url,
                    content=exc.read(),
                    headers={key.lower(): value for key, value in exc.headers.items()},
                )


class BaseCollector:
    def __init__(self, fetcher: HttpFetcher | None = None) -> None:
        self.fetcher = fetcher or HttpFetcher()

    def collect(self, source: SourceDefinition, settings: Settings) -> SourceDocument:
        response = self.fetcher.fetch(source, settings)
        extracted_text = self.extract_text(response.content, response.headers.get("content-type", "application/octet-stream"))
        return SourceDocument(
            source_slug=source.slug,
            source_url=source.source_url,
            final_url=response.url,
            content_type=response.headers.get("content-type", "application/octet-stream"),
            http_status=response.status_code,
            content_bytes=response.content,
            extracted_text=extracted_text,
            sha256=sha256_bytes(response.content),
            etag=response.headers.get("etag"),
            last_modified_header=response.headers.get("last-modified"),
            metadata={"headers": json.dumps(response.headers, ensure_ascii=True)},
        )

    def extract_text(self, content: bytes, content_type: str) -> str:
        raise NotImplementedError

    @staticmethod
    def html_to_text(value: str) -> str:
        value = re.sub(r"(?is)<script.*?>.*?</script>", " ", value)
        value = re.sub(r"(?is)<style.*?>.*?</style>", " ", value)
        value = re.sub(r"(?s)<[^>]+>", " ", value)
        value = value.replace("&nbsp;", " ")
        return re.sub(r"\s+", " ", value).strip()
