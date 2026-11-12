import unittest
from decimal import Decimal
from collector import (
    parse_offer, links_from_index, validate_url, package_quantity,
    quality_checks, RestrictedRedirect, run,
)


def html(name="Riz basmati U 1 kg", price="2,49 €", package="Sachet de 1 kg", per_kg="2,49 €", retailer="Super U"):
    return (
        f"<html><p>{retailer}</p><h1>{name}</h1><p>{price}</p>"
        f"<p>Le kg : {per_kg}</p><div>Conditionnement {package}"
        f" Validité de l’offre Du 03/11/2026 au 15/11/2026</div></html>"
    )


class QualityTests(unittest.TestCase):
    URL = "https://lapub.re/offres/riz-u-test"

    def test_valid_offer_still_requires_human_review(self):
        c = parse_offer(html(), self.URL)
        self.assertEqual(c["status"], "needs_review")
        self.assertFalse(c["can_auto_publish"])
        self.assertTrue(c["checks"]["manual_price_and_product_verification_required"])
        self.assertEqual(c["advertised_price_eur"], "2.49")
        self.assertEqual(c["valid_from"], "2026-11-03")

    def test_related_u_formats_grouped_but_not_assumed_same_offer(self):
        self.assertIsNone(parse_offer(html(retailer="Carrefour"), self.URL))
        for label, expected in [("Super U", "superu"), ("Hyper U", "hyperu"), ("U Express", "uexpress")]:
            with self.subTest(label=label):
                candidate = parse_offer(html(retailer=label), self.URL)
                self.assertIsNotNone(candidate)
                self.assertEqual(candidate["retailer_group"], "Magasins U Réunion")
                self.assertEqual(candidate["store_format"], expected)
                self.assertFalse(candidate["can_apply_price_to_other_format"])
                self.assertFalse(candidate["can_auto_publish"])

    def test_missing_pack_blocks_review(self):
        c = parse_offer(html(package="inconnu"), self.URL)
        self.assertIn("missing_or_ambiguous_package_size", c["checks"]["blocking_issues"])

    def test_misleading_unit_price_is_blocked(self):
        c = parse_offer(html(name="Riz U 500 g", package="Sachet de 500 g"), self.URL)
        self.assertIn("unit_price_math_mismatch", c["checks"]["blocking_issues"])

    def test_name_and_pack_disagreement(self):
        c = parse_offer(html(name="Riz U 1 kg", package="Sachet de 500 g", per_kg="4,98 €"), self.URL)
        self.assertIn("name_package_mismatch", c["checks"]["blocking_issues"])

    def test_multiple_prices_warning(self):
        c = parse_offer(html(price="4,99 € puis 2,49 €"), self.URL)
        self.assertIn("multiple_prices_on_page", c["checks"]["warnings"])

    def test_conditional_offer_flag(self):
        c = parse_offer(html(price="2,49 € les 2 pour 4,99 €"), self.URL)
        self.assertTrue(c["conditional"])
        self.assertIn("conditional_offer_requires_manual_review", c["checks"]["warnings"])

    def test_bad_date_rejected(self):
        doc = html().replace("15/11/2026", "01/11/2026")
        self.assertIsNone(parse_offer(doc, self.URL))

    def test_euro_comma_format(self):
        c = parse_offer(html(price="2€,49"), self.URL)
        self.assertEqual(c["advertised_price_eur"], "2.49")

    def test_multipack_quantity(self):
        self.assertEqual(package_quantity("6 bouteilles de 1,5 L"), ("l", Decimal("9.0")))
        self.assertEqual(package_quantity("4 x 125 g"), ("kg", Decimal("0.500")))

    def test_links_not_outside_host(self):
        doc = '<a href="/offres/riz-u">a</a><a href="https://evil.example/offres/fake">b</a>'
        self.assertEqual(links_from_index(doc, "https://lapub.re/offres/", 5), ["https://lapub.re/offres/riz-u"])

    def test_non_https_and_port_rejected(self):
        for url in ["http://lapub.re/offres/x", "https://lapub.re:443/offres/x", "https://evil.test/offres/x"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_url(url)

    def test_unavailable_source_gracefully_reported(self):
        from unittest.mock import patch
        with patch("collector.permitted", return_value=True), patch("collector.fetch", side_effect=Exception("bad_http")):
            result = run(self.URL, max_pages=1)
        self.assertEqual(result["status"], "source_unavailable")
        self.assertEqual(result["published"], 0)

    def test_non_food_offer_ignored(self):
        c = parse_offer(html(name="Réfrigérateur 200 L"), self.URL)
        self.assertIsNone(c)

    def test_sausages_are_food(self):
        candidate = parse_offer(html(name="Saucisses de porc 1 kg"), self.URL)
        self.assertIsNotNone(candidate)

    def test_unit_math_rounding(self):
        check = quality_checks("Riz U 1 kg", "sachet 1 kg", Decimal("2.49"), Decimal("2.49"), "kg", [], False, __import__("datetime").date(2026, 11, 15))
        self.assertEqual(check["blocking_issues"], [])
        self.assertFalse(check["can_auto_publish"])


if __name__ == "__main__":
    unittest.main()
