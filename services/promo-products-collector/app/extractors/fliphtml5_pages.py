from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit


CONFIG_SCRIPT_RE = re.compile(
    r'<script[^>]+src="([^"]*javascript/config\.js[^"]*)"',
    flags=re.IGNORECASE,
)
PAGE_ASSET_RE = re.compile(
    r'(?:(?:https?:)?//[^\s"\'\\]+?/files/large/[^\s"\'\\]+?\.webp(?:\?[^\s"\'\\]+)?)|(?:\.{0,2}/)?files/large/[^\s"\'\\]+?\.webp(?:\?[^\s"\'\\]+)?',
    flags=re.IGNORECASE,
)


@dataclass(frozen=True)
class FlipHtml5Viewer:
    viewer_url: str
    config_url: str


@dataclass(frozen=True)
class PageAsset:
    page_number: int
    asset_url: str


def discover_viewer(viewer_html: str, viewer_url: str, allowed_hosts: set[str]) -> FlipHtml5Viewer:
    if "fliphtml5.com" not in viewer_html.lower() and "monitor:player:html5" not in viewer_html.lower():
        raise ValueError("not_a_fliphtml5_viewer")
    match = CONFIG_SCRIPT_RE.search(viewer_html)
    if not match:
        raise ValueError("fliphtml5_config_not_found")
    config_url = _resolve_url(match.group(1), viewer_url)
    if not _is_allowed_url(config_url, allowed_hosts):
        raise ValueError("fliphtml5_config_out_of_domain")
    return FlipHtml5Viewer(viewer_url=viewer_url, config_url=config_url)


def extract_page_assets(config_js: str, base_url: str, allowed_hosts: set[str]) -> list[PageAsset]:
    ordered_urls: list[str] = []
    seen: set[str] = set()
    for match in PAGE_ASSET_RE.finditer(config_js):
        resolved = _resolve_asset_url(match.group(0), base_url)
        if not _is_allowed_url(resolved, allowed_hosts):
            continue
        dedupe_key = _dedupe_key(resolved)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        ordered_urls.append(resolved)
    return [
        PageAsset(page_number=index + 1, asset_url=asset_url)
        for index, asset_url in enumerate(ordered_urls)
    ]


def _resolve_url(value: str, base_url: str) -> str:
    return urljoin(_directory_base_url(base_url), value.strip())


def _resolve_asset_url(value: str, base_url: str) -> str:
    cleaned = value.strip()
    if re.match(r"^(?:\.{0,2}/)?files/", cleaned, flags=re.IGNORECASE):
        return urljoin(_catalog_root_url(base_url), cleaned.lstrip("./"))
    return _resolve_url(cleaned, base_url)


def _directory_base_url(base_url: str) -> str:
    split = urlsplit(base_url)
    if split.path.endswith("/"):
        return base_url
    tail = split.path.rsplit("/", 1)[-1]
    if "." not in tail:
        return urlunsplit((split.scheme, split.netloc, f"{split.path}/", split.query, split.fragment))
    return base_url


def _catalog_root_url(base_url: str) -> str:
    split = urlsplit(base_url)
    marker = "/javascript/"
    lower_path = split.path.lower()
    marker_index = lower_path.find(marker)
    if marker_index >= 0:
        root_path = split.path[:marker_index].rstrip("/") + "/"
        return urlunsplit((split.scheme, split.netloc, root_path, "", ""))
    return _directory_base_url(base_url)


def _dedupe_key(value: str) -> str:
    split = urlsplit(value)
    return urlunsplit((split.scheme.lower(), split.netloc.lower(), split.path, "", ""))


def _is_allowed_url(value: str, allowed_hosts: set[str]) -> bool:
    split = urlsplit(value)
    host = (split.hostname or "").lower()
    return bool(host) and host in {item.lower() for item in allowed_hosts}
