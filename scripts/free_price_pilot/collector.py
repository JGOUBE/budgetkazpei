"""Free, read-only, manual-review-only Super U Reunion offer collector.

No Supabase credentials, paid APIs, OCR, scheduling or database writes.
Source LAPUB is third party; retailer confirmation is mandatory.
"""
from __future__ import annotations

import argparse
from datetime import date
from decimal import Decimal
from html.parser import HTMLParser
import json
import re
import sys
import time
from urllib.parse import urljoin, urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

HOSTS = {"lapub.re", "www.lapub.re"}
USER_AGENT = "BudgetKazPeiPriceAudit/0.1 (+https://budgetkazpei.re)"
PRICE_RE = re.compile(r"(?<!\d)(\d{1,4}(?:[ \u202f]\d{3})*,\d{2})\s*€|(?<!\d)(\d{1,4})\s*€\s*,?\s*(\d{2})(?!\d)")
DATES_RE = re.compile(r"\bDu\s+(\d{2}/\d{2}/20\d{2})\s+au\s+(\d{2}/\d{2}/20\d{2})", re.I)
UNIT_PRICE_RE = re.compile(r"\b(?:Le|Au)\s+(kg|L|litre)\s*:\s*(\d{1,4},\d{2})\s*€", re.I)
QTY_RE = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b", re.I)
PACK_RE = re.compile(r"\b(\d{1,3})\s*(?:x|×|bouteilles?\s+de|pots?\s+de|briques?\s+de|sachets?\s+de)\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b", re.I)
FOOD_RE = re.compile(r"riz|pâtes|pates|lait|yaourt|huile|farine|sucre|café|cafe|beurre|fromage|chocolat|oeuf|œuf|thon|lentille|haricot|biscuit|jus|sauce|céréale|cereale|poulet|poisson|épicerie|epicerie|saucisse|porc|charcuterie|jambon|steak|viande|bœuf|boeuf|boisson|fruits|légumes|legumes|surgelé|surgele", re.I)
SIZES = {"kg": ("kg", Decimal(1)), "g": ("kg", Decimal(".001")), "l": ("l", Decimal(1)), "cl": ("l", Decimal(".01")), "ml": ("l", Decimal(".001"))}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.words, self.titles, self.links = [], [], []
        self.hidden, self.heading = 0, 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self.hidden += 1
        if tag == "h1":
            self.heading += 1
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"):
            self.hidden = max(0, self.hidden - 1)
        if tag == "h1":
            self.heading = max(0, self.heading - 1)

    def handle_data(self, data):
        if not self.hidden and data.strip():
            word = " ".join(data.split())
            self.words.append(word)
            if self.heading:
                self.titles.append(word)

    @property
    def text(self):
        return " ".join(self.words)


def validate_url(url, offer_only=False):
    p = urlparse(url)
    if p.scheme != "https" or p.hostname not in HOSTS or p.username or p.password or p.port:
        raise ValueError("unsupported_host_or_scheme")
    if offer_only and not p.path.startswith("/offres/"):
        raise ValueError("not_offer_page")
    return url


class RestrictedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


HTTP = build_opener(RestrictedRedirect())


def fetch(url, timeout=8, max_bytes=1_000_000):
    validate_url(url)
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with HTTP.open(req, timeout=timeout) as response:
        validate_url(response.geturl())
        if "html" not in response.headers.get("Content-Type", "").lower():
            raise ValueError("not_html")
        content = response.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError("too_large")
        return content.decode("utf-8", "replace")


def permitted(url, timeout=8):
    validate_url(url)
    p = urlparse(url)
    try:
        with HTTP.open(Request("https://" + p.hostname + "/robots.txt", headers={"User-Agent": USER_AGENT}), timeout=timeout) as response:
            validate_url(response.geturl())
            if response.status != 200:
                return False
            robots = response.read(120_000).decode("utf-8", "replace")
    except Exception:
        return False
    parser = RobotFileParser()
    parser.parse(robots.splitlines())
    return parser.can_fetch(USER_AGENT, url)


def money(raw):
    return Decimal(raw.replace("\u202f", "").replace(" ", "").replace(",", "."))


def found_prices(text):
    rows = []
    for match in PRICE_RE.finditer(text):
        amount = money(match.group(1)) if match.group(1) else Decimal(match.group(2) + "." + match.group(3))
        rows.append(amount)
    return rows


def package_quantity(raw):
    if not raw:
        return None
    multi = PACK_RE.search(raw)
    if multi:
        unit, multiplier = SIZES[multi.group(3).lower()]
        return unit, Decimal(multi.group(1)) * money(multi.group(2)) * multiplier
    single = QTY_RE.search(raw)
    if single:
        unit, multiplier = SIZES[single.group(2).lower()]
        return unit, money(single.group(1)) * multiplier
    return None


def quality_checks(name, packaging, price, price_per_unit, unit, other_prices, is_conditional, valid_until):
    blockers, warnings = [], []
    quantity = package_quantity(packaging)
    name_quantity = package_quantity(name)
    if not quantity:
        blockers.append("missing_or_ambiguous_package_size")
    if quantity and name_quantity and (quantity[0] != name_quantity[0] or quantity[1] != name_quantity[1]):
        blockers.append("name_package_mismatch")
    if price_per_unit is not None and quantity is not None:
        if unit != quantity[0] or quantity[1] <= 0:
            blockers.append("unit_price_unit_mismatch")
        else:
            computed = (price / quantity[1]).quantize(Decimal("0.01"))
            if abs(computed - price_per_unit) > max(Decimal("0.03"), computed * Decimal("0.02")):
                blockers.append("unit_price_math_mismatch")
    else:
        warnings.append("unit_price_not_independently_checked")
    if len(set([price] + other_prices)) > 1:
        warnings.append("multiple_prices_on_page")
    if is_conditional:
        warnings.append("conditional_offer_requires_manual_review")
    if valid_until < date.today():
        warnings.append("historical_price_offer_expired")
    warnings += ["store_location_unverified", "official_retailer_crosscheck_pending"]
    return {"blocking_issues": blockers, "warnings": warnings,
            "quantity": str(quantity[1]) if quantity else None,
            "quantity_unit": quantity[0] if quantity else None,
            "manual_price_and_product_verification_required": True,
            "can_auto_publish": False}


def parse_offer(html, url):
    validate_url(url, offer_only=True)
    page = Page()
    page.feed(html)
    title, body = " ".join(page.titles).strip(), page.text
    if len(title) < 5 or not FOOD_RE.search(title):
        return None
    idx = body.find(title)
    if idx < 0:
        return None
    retailer_near_title = re.search(r"\b(Super\s*U|Hyper\s*U|U\s*Express|Carrefour(?:\s*Market)?|E[. ]?Leclerc)\b", body[max(0, idx-250):idx], re.I)
    if not retailer_near_title:
        return None
    retail_format = retailer_near_title.group(1).casefold().replace(" ", "")
    if retail_format not in {"superu", "hyperu", "uexpress"}:
        return None
    after_title = body[idx+len(title):idx+len(title)+380]
    prices = found_prices(after_title)
    interval = DATES_RE.search(body)
    if not prices or not interval or prices[0] <= 0 or prices[0] > 1000:
        return None
    dates = [date.fromisoformat("-".join(reversed(s.split("/")))) for s in interval.groups()]
    if dates[1] < dates[0]:
        return None
    pkg_match = re.search(r"Conditionnement\s+(.{2,90}?)\s+(?:Validité de l.offre|Description du produit|Conditions de l.offre)", body, re.I)
    packaging = pkg_match.group(1).strip() if pkg_match else None
    unit_match = UNIT_PRICE_RE.search(after_title)
    unit_amount = money(unit_match.group(2)) if unit_match else None
    unit = ("kg" if unit_match.group(1).lower() == "kg" else "l") if unit_match else None
    conditional = bool(re.search(r"\b(?:les\s+[234]\s+pour|lot\s+de|avec\s+la\s+carte|carte\s+u|à\s+partir\s+de|au\s+choix)\b", after_title, re.I))
    checks = quality_checks(title, packaging, prices[0], unit_amount, unit, prices[1:], conditional, dates[1])
    return {"status": "needs_review", "source_type": "third_party_public_offer",
            "source_url": url, "retailer_group": "Magasins U Réunion",
            "retailer": {"hyperu": "Hyper U", "superu": "Super U", "uexpress": "U Express"}[retail_format],
            "store_format": retail_format, "store": "unverified",
            "catalog_scope": "not_verified", "can_group_same_brand": True, "can_apply_price_to_other_format": False,
            "product_name": title, "packaging": packaging, "advertised_price_eur": str(prices[0]),
            "price_per_unit_eur": str(unit_amount) if unit_amount is not None else None,
            "unit": unit, "valid_from": dates[0].isoformat(), "valid_until": dates[1].isoformat(),
            "conditional": conditional, "all_detected_prices_eur": [str(p) for p in prices],
            "checks": checks, "can_auto_publish": False}


def links_from_index(html, index_url, maximum):
    validate_url(index_url)
    page = Page()
    page.feed(html)
    result = []
    for href in page.links:
        url = urljoin(index_url, href)
        try:
            validate_url(url, offer_only=True)
        except ValueError:
            continue
        if url not in result:
            result.append(url)
        if len(result) == maximum:
            break
    return result


def run(url, max_pages=3):
    validate_url(url)
    if not 1 <= max_pages <= 10:
        raise ValueError("invalid_page_limit")
    if not permitted(url):
        return {"status": "robots_block_or_unavailable", "inspected": 0, "candidates": []}
    try:
        index = fetch(url)
    except Exception as ex:
        return {"status": "source_unavailable", "inspected": 0, "candidates": [],
                "published": 0, "errors": [{"source": url, "reason": type(ex).__name__}]}
    urls = [url] if urlparse(url).path.startswith("/offres/") else links_from_index(index, url, max_pages)
    candidates, errors = [], []
    for number, target in enumerate(urls):
        if number:
            time.sleep(2)
        if not permitted(target):
            errors.append({"source": target, "reason": "robots_block_or_unavailable"})
            continue
        try:
            item = parse_offer(index if target == url else fetch(target), target)
            if item:
                candidates.append(item)
        except Exception as ex:
            errors.append({"source": target, "reason": type(ex).__name__})
    return {"status": "read_only", "inspected": len(urls), "candidates": candidates,
            "blocked_by_quality_checks": sum(bool(x["checks"]["blocking_issues"]) for x in candidates),
            "awaiting_manual_validation": len(candidates), "published": 0, "errors": errors}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="Public LAPUB listing or offer URL")
    parser.add_argument("--limit", type=int, default=3)
    args = parser.parse_args()
    try:
        result = run(args.url, args.limit)
    except Exception as ex:
        result = {"status": "error", "reason": type(ex).__name__}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["status"] == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
