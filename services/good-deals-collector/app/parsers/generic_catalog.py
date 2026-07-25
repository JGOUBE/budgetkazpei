from __future__ import annotations

import re
from datetime import datetime, timezone

from app.models.candidate import Candidate
from app.models.document import SourceDocument
from app.models.source import SourceDefinition
from app.services.normalization import compact_excerpt, normalize_text, parse_decimal, parse_french_date

from .base import BaseParser


class GenericCatalogParser(BaseParser):
    parser_key = "generic_catalog"

    def parse(self, source: SourceDefinition, document: SourceDocument) -> list[Candidate]:
        text = document.extracted_text or document.content_bytes.decode("utf-8", errors="ignore")
        lines = [line.strip() for line in re.split(r"[\r\n]+", text) if line.strip()]
        starts_at, ends_at = self._find_date_window(text)
        price_lines = self._extract_price_lines(lines)
        candidates: list[Candidate] = []
        for index, line in enumerate(price_lines[:12]):
            title = re.sub(r"\s+", " ", line["title"]).strip(" -:")
            promo_price = line["promo_price"]
            original_price = line["original_price"]
            candidate = self.make_candidate(
                source,
                external_key=self.build_external_key(source, f"{title}-{index}-{promo_price}"),
                title=f"{title} - {promo_price:.2f} EUR" if promo_price is not None else title,
                description=compact_excerpt(line["raw"], 400) or title,
                source_url=document.final_url,
                source_excerpt=line["raw"],
            )
            candidate.content_kind = "promotion"
            candidate.business_name = source.name
            candidate.product_name = title
            candidate.normalized_product_name = normalize_text(title)
            candidate.category = "shopping"
            candidate.starts_at = starts_at
            candidate.ends_at = ends_at
            candidate.promo_price = promo_price
            candidate.original_price = original_price
            if promo_price is not None and original_price and original_price > 0:
                candidate.discount_percent = round((1 - (promo_price / original_price)) * 100, 2)
            candidate.price_note = "Prix annonce" if original_price is None else None
            candidates.append(candidate)
        if candidates:
            return candidates

        fallback = self.make_candidate(
            source,
            external_key=self.build_external_key(source, document.sha256[:12]),
            title=f"{source.name} - catalogue detecte",
            description=compact_excerpt(text, 500) or source.name,
            source_url=document.final_url,
            source_excerpt=compact_excerpt(text, 200),
        )
        fallback.content_kind = "promotion"
        fallback.business_name = source.name
        fallback.category = "shopping"
        fallback.starts_at = starts_at
        fallback.ends_at = ends_at
        return [fallback]

    @staticmethod
    def _find_date_window(text: str) -> tuple[datetime | None, datetime | None]:
        matches = re.findall(
            r"du\s+(\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?)\s+au\s+(\d{1,2}\s+[A-Za-zéûîôàèùç]+(?:\s+\d{4})?)",
            text,
            flags=re.IGNORECASE,
        )
        if not matches:
            return None, None
        today = datetime.now(timezone.utc)
        start = parse_french_date(matches[0][0], default_year=today.year)
        end = parse_french_date(matches[0][1], default_year=today.year)
        return start, end

    @staticmethod
    def _extract_price_lines(lines: list[str]) -> list[dict[str, object]]:
        results: list[dict[str, object]] = []
        for line in lines:
            if "€" not in line:
                continue
            prices = re.findall(r"(\d{1,3}(?:[.,]\d{2}))\s*€", line)
            if not prices:
                continue
            title = re.sub(r"(\d{1,3}(?:[.,]\d{2}))\s*€.*", "", line).strip(" -:")
            promo_price = parse_decimal(prices[0])
            original_price = parse_decimal(prices[1]) if len(prices) > 1 else None
            results.append(
                {
                    "title": title or line[:80],
                    "promo_price": promo_price,
                    "original_price": original_price,
                    "raw": line,
                }
            )
        return results
