from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit


CONFIG_SCRIPT_RE = re.compile(
    r'<script[^>]+src="([^"]*javascript/config\.js[^"]*)"',
    flags=re.IGNORECASE,
)
PAGE_ASSET_RE = re.compile(
    r'(?:(?:https?:)?//[^\s"\'\\]+?/files/(?:large|thumb)/[^\s"\'\\]+?\.webp(?:\?[^\s"\'\\]+)?)|(?:\.{0,2}/)?files/(?:large|thumb)/[^\s"\'\\]+?\.webp(?:\?[^\s"\'\\]+)?',
    flags=re.IGNORECASE,
)
PAGE_OBJECT_RE = re.compile(
    r'\{"n":\["([^"]+?\.webp)"\],"t":"([^"]+?\.webp)"\}',
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
    thumbnail_url: str | None = None


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
    page_assets: dict[int, dict[str, str | None]] = {}
    for match in PAGE_ASSET_RE.finditer(config_js):
        resolved = _resolve_asset_url(match.group(0), base_url)
        if not _is_allowed_url(resolved, allowed_hosts):
            continue
        page_number = _extract_page_number(resolved)
        if page_number is None:
            continue
        record = page_assets.setdefault(page_number, {"asset_url": None, "thumbnail_url": None})
        if "/files/thumb/" in resolved.lower():
            if record["thumbnail_url"] is None:
                record["thumbnail_url"] = resolved
        else:
            if record["asset_url"] is None:
                record["asset_url"] = resolved
    ordered: list[PageAsset] = []
    for page_number in sorted(page_assets):
        record = page_assets[page_number]
        asset_url = record["asset_url"] or record["thumbnail_url"]
        if asset_url is None:
            continue
        ordered.append(
            PageAsset(
                page_number=page_number,
                asset_url=asset_url,
                thumbnail_url=record["thumbnail_url"],
            )
        )
    if ordered:
        return ordered

    fallback: list[PageAsset] = []
    for index, match in enumerate(PAGE_OBJECT_RE.finditer(config_js), start=1):
        large_name = match.group(1)
        thumb_value = match.group(2)
        asset_url = _resolve_asset_url(f"./files/large/{large_name}", base_url)
        thumb_url = _resolve_asset_url(thumb_value, base_url)
        if not _is_allowed_url(asset_url, allowed_hosts):
            continue
        if not _is_allowed_url(thumb_url, allowed_hosts):
            thumb_url = None
        fallback.append(
            PageAsset(
                page_number=index,
                asset_url=asset_url,
                thumbnail_url=thumb_url,
            )
        )
    if fallback:
        return fallback
    return ordered


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


def _extract_page_number(value: str) -> int | None:
    match = re.search(r"page[-_]?(\d+)\.webp", urlsplit(value).path, flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def _is_allowed_url(value: str, allowed_hosts: set[str]) -> bool:
    split = urlsplit(value)
    host = (split.hostname or "").lower()
    return bool(host) and host in {item.lower() for item in allowed_hosts}
