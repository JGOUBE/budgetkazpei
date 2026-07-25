from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import datetime

from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.hashing import sha256_json
from app.services.normalization import normalize_text, normalize_url, parse_french_date_range


class FingerprintExtractionError(RuntimeError):
    pass


@dataclass(frozen=True)
class CatalogEntry:
    title: str
    canonical_url: str
    starts_at: datetime | None
    ends_at: datetime | None
    period_text: str | None = None
    store_format: str | None = None
    brand: str | None = None
    image_url: str | None = None
    stable_id: str | None = None
    scope_label: str | None = None
    source_excerpt: str | None = None

    def fingerprint_payload(self) -> dict[str, object]:
        return {
            "title": normalize_text(self.title),
            "canonical_url": self.canonical_url,
            "starts_at": self.starts_at.date().isoformat() if self.starts_at else None,
            "ends_at": self.ends_at.date().isoformat() if self.ends_at else None,
            "period_text": normalize_text(self.period_text),
            "store_format": normalize_text(self.store_format),
            "brand": normalize_text(self.brand),
            "image_url": self.image_url,
            "stable_id": normalize_text(self.stable_id),
            "scope_label": normalize_text(self.scope_label),
        }


@dataclass(frozen=True)
class SourceFingerprint:
    strategy: str
    sha256: str
    catalog_count: int
    semantic_items_count: int


CARREFOUR_CARD_RE = re.compile(
    r'<div class="catalog">\s*<picture>.*?<img[^>]+src="([^"]+)"[^>]*>.*?</picture>\s*'
    r'<div class="title">(.*?)</div>\s*'
    r'<div class="subtitle">(.*?)</div>\s*'
    r'<div class="link">\s*<a href="([^"]+)"([^>]*)>',
    flags=re.IGNORECASE | re.DOTALL,
)
AUCHAN_CARD_RE = re.compile(
    r'<div class="bg-white rounded-xl p-2">.*?<img src="([^"]+)"[^>]*>.*?'
    r'<h2 class="fw-black">(.*?)</h2>.*?'
    r'<div class="text-sm text-black/50">\s*(.*?)\s*</div>.*?'
    r'<a href="([^"]+)"[^>]*class="a-link">',
    flags=re.IGNORECASE | re.DOTALL,
)
ELECLERC_LINK_RE = re.compile(
    r'<li>\s*<a href="([^"]+)"[^>]*target="_blank"[^>]*title="([^"]*Catalogue E\.Leclerc[^"]*)"[^>]*>(.*?)</a>\s*</li>',
    flags=re.IGNORECASE | re.DOTALL,
)
RUN_MARKET_LINK_RE = re.compile(
    r'<a[^>]+href="([^"]*interactive-catalogue[^"]*)"[^>]*>(.*?)</a>',
    flags=re.IGNORECASE | re.DOTALL,
)


def build_source_fingerprint(source: SourceDefinition, document: SourceDocument) -> SourceFingerprint:
    if source.slug == "carrefour-reunion-catalogues" or source.parser_key == "carrefour_reunion":
        entries = extract_carrefour_catalog_entries(source, document)
        return _build_catalog_fingerprint("carrefour_catalog_cards_v1", entries)
    if source.slug == "auchan-saint-louis-catalogues" or source.parser_key == "auchan_saint_louis":
        entries = extract_auchan_catalog_entries(source, document)
        return _build_catalog_fingerprint("auchan_catalog_cards_v1", entries)
    if source.slug == "e-leclerc-reunion-catalogues" or source.parser_key == "eleclerc_reunion":
        entries = extract_eleclerc_catalog_entries(source, document)
        return _build_catalog_fingerprint("eleclerc_catalog_links_v1", entries)
    if source.slug == "run-market-reunion-home" or source.parser_key == "run_market_reunion":
        entries = extract_run_market_catalog_entries(source, document)
        return _build_catalog_fingerprint("run_market_catalog_cards_v1", entries)
    return SourceFingerprint(
        strategy="raw_response_sha256",
        sha256=document.sha256 or sha256_json({"source_slug": source.slug, "source_url": source.source_url}),
        catalog_count=0,
        semantic_items_count=0,
    )


def extract_eleclerc_catalog_entries(source: SourceDefinition, document: SourceDocument) -> list[CatalogEntry]:
    cleaned_html = _strip_html_comments(document.content_bytes.decode("utf-8", errors="ignore"))
    entries: list[CatalogEntry] = []
    for match in ELECLERC_LINK_RE.finditer(cleaned_html):
        href, title_attr, label_html = match.groups()
        if "/public/catalogues/" not in href:
            continue
        canonical_url = normalize_url(href, document.final_url or source.source_url)
        if not canonical_url:
            continue
        label = _clean_text(label_html)
        title_text = _clean_text(title_attr)
        starts_at, ends_at = parse_french_date_range(title_text, default_year=2026)
        store_format = _extract_format(label) or _extract_format(title_text)
        stable_id = canonical_url.rstrip("/").rsplit("/", 1)[-1]
        entries.append(
            CatalogEntry(
                title=label,
                canonical_url=canonical_url,
                starts_at=starts_at,
                ends_at=ends_at,
                period_text=title_text,
                store_format=store_format,
                brand="E.Leclerc Reunion",
                stable_id=stable_id,
                scope_label="Reunion",
                source_excerpt=title_text,
            )
        )
    return _finalize_entries(entries, source.slug)


def extract_carrefour_catalog_entries(source: SourceDefinition, document: SourceDocument) -> list[CatalogEntry]:
    html_text = document.content_bytes.decode("utf-8", errors="ignore")
    entries: list[CatalogEntry] = []
    for match in CARREFOUR_CARD_RE.finditer(html_text):
        image_src, title_html, subtitle_html, href, anchor_attrs = match.groups()
        canonical_url = normalize_url(href, document.final_url or source.source_url)
        if not canonical_url:
            continue
        image_url = normalize_url(image_src, document.final_url or source.source_url)
        period_text = _clean_text(subtitle_html)
        starts_at, ends_at = parse_french_date_range(period_text, default_year=2026)
        stable_id = _extract_attr(anchor_attrs, "data-flipping-book-id") or _extract_stable_id_from_url(canonical_url)
        entries.append(
            CatalogEntry(
                title=_clean_text(title_html),
                canonical_url=canonical_url,
                starts_at=starts_at,
                ends_at=ends_at,
                period_text=period_text,
                store_format=_extract_attr(anchor_attrs, "data-brand"),
                brand="Carrefour Reunion",
                image_url=image_url,
                stable_id=stable_id,
                source_excerpt=f"{_clean_text(title_html)} {period_text}".strip(),
            )
        )
    return _finalize_entries(entries, source.slug)


def extract_auchan_catalog_entries(source: SourceDefinition, document: SourceDocument) -> list[CatalogEntry]:
    html_text = document.content_bytes.decode("utf-8", errors="ignore")
    entries: list[CatalogEntry] = []
    for match in AUCHAN_CARD_RE.finditer(html_text):
        image_src, title_html, period_html, href = match.groups()
        canonical_url = normalize_url(href, document.final_url or source.source_url)
        if not canonical_url:
            continue
        image_url = normalize_url(image_src, document.final_url or source.source_url)
        period_text = _clean_text(period_html)
        starts_at, ends_at = parse_french_date_range(period_text, default_year=2026)
        entries.append(
            CatalogEntry(
                title=_clean_text(title_html),
                canonical_url=canonical_url,
                starts_at=starts_at,
                ends_at=ends_at,
                period_text=period_text,
                brand="Auchan Saint-Louis",
                image_url=image_url,
                stable_id=_extract_stable_id_from_url(canonical_url),
                scope_label="Saint-Louis",
                source_excerpt=f"{_clean_text(title_html)} {period_text}".strip(),
            )
        )
    return _finalize_entries(entries, source.slug)


def extract_run_market_catalog_entries(source: SourceDefinition, document: SourceDocument) -> list[CatalogEntry]:
    html_text = _strip_html_comments(document.content_bytes.decode("utf-8", errors="ignore"))
    entries: list[CatalogEntry] = []
    for match in RUN_MARKET_LINK_RE.finditer(html_text):
        href, anchor_html = match.groups()
        canonical_url = normalize_url(href, document.final_url or source.source_url)
        if not canonical_url:
            continue

        before_context = html_text[max(0, match.start() - 8000) : match.start()]
        after_context = html_text[match.end() : min(len(html_text), match.end() + 2500)]

        before_date_candidates = re.findall(r"<p>\s*(Du .*?)</p>", before_context, flags=re.IGNORECASE | re.DOTALL)
        after_date_candidates = re.findall(r"<p>\s*(Du .*?)</p>", after_context, flags=re.IGNORECASE | re.DOTALL)
        before_heading_candidates = re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", before_context, flags=re.IGNORECASE | re.DOTALL)
        after_heading_candidates = re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", after_context, flags=re.IGNORECASE | re.DOTALL)
        before_paragraph_candidates = re.findall(r"<p>\s*(.*?)</p>", before_context, flags=re.IGNORECASE | re.DOTALL)
        after_paragraph_candidates = re.findall(r"<p>\s*(.*?)</p>", after_context, flags=re.IGNORECASE | re.DOTALL)

        period_text = _clean_text(before_date_candidates[-1]) if before_date_candidates else _clean_text(after_date_candidates[0]) if after_date_candidates else ""
        title = _clean_text(before_heading_candidates[-1]) if before_heading_candidates else _clean_text(after_heading_candidates[0]) if after_heading_candidates else ""
        description = ""
        for candidate in list(reversed(before_paragraph_candidates)) + after_paragraph_candidates:
            cleaned = _clean_text(candidate)
            if not cleaned or cleaned == period_text:
                continue
            description = cleaned
            break

        if not title:
            title = _clean_text(anchor_html)
        if not title:
            title = _extract_stable_id_from_url(canonical_url) or ""

        starts_at, ends_at = parse_french_date_range(period_text, default_year=2026)

        image_url = None
        background_matches = re.findall(
            r'background-image:url\("([^"]+)"\)',
            before_context + after_context,
            flags=re.IGNORECASE,
        )
        if background_matches:
            image_url = normalize_url(background_matches[-1], document.final_url or source.source_url)
        else:
            image_matches = re.findall(r'<img[^>]+src="([^"]+)"[^>]*>', before_context + after_context, flags=re.IGNORECASE)
            if image_matches:
                image_url = normalize_url(image_matches[-1], document.final_url or source.source_url)

        stable_id = _extract_stable_id_from_url(canonical_url)
        entries.append(
            CatalogEntry(
                title=title,
                canonical_url=canonical_url,
                starts_at=starts_at,
                ends_at=ends_at,
                period_text=period_text or None,
                brand="Run Market Reunion",
                image_url=image_url,
                stable_id=stable_id,
                scope_label="Reunion",
                source_excerpt=" ".join(part for part in [period_text, title, description] if part).strip() or None,
            )
        )
    return _finalize_entries(entries, source.slug)


def _build_catalog_fingerprint(strategy: str, entries: list[CatalogEntry]) -> SourceFingerprint:
    payload = [entry.fingerprint_payload() for entry in entries]
    return SourceFingerprint(
        strategy=strategy,
        sha256=sha256_json(payload),
        catalog_count=len(entries),
        semantic_items_count=len(entries),
    )


def _finalize_entries(entries: list[CatalogEntry], source_slug: str) -> list[CatalogEntry]:
    if not entries:
        raise FingerprintExtractionError(f"No catalog entries extracted for {source_slug}.")
    unique_entries: dict[str, CatalogEntry] = {}
    for entry in entries:
        unique_entries[sha256_json(entry.fingerprint_payload())] = entry
    result = sorted(unique_entries.values(), key=lambda entry: (entry.canonical_url, normalize_text(entry.title)))
    if not result:
        raise FingerprintExtractionError(f"No stable catalog entries extracted for {source_slug}.")
    return result


def _extract_attr(attrs: str, name: str) -> str | None:
    match = re.search(rf'{re.escape(name)}="([^"]+)"', attrs, flags=re.IGNORECASE)
    return _clean_text(match.group(1)) if match else None


def _extract_format(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"\(([^)]+)\)", value)
    return _clean_text(match.group(1)) if match else None


def _extract_stable_id_from_url(value: str) -> str | None:
    tail = value.rstrip("/").rsplit("/", 1)[-1]
    return tail or None


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    without_tags = re.sub(r"(?is)<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(without_tags)).strip()


def _strip_html_comments(value: str) -> str:
    return re.sub(r"(?is)<!--.*?-->", "", value)
