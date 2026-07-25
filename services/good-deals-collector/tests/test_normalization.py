import unittest

from app.services.normalization import (
    normalize_size_label,
    normalize_text,
    normalize_url,
    parse_decimal,
    parse_french_date,
    parse_french_date_range,
)


class NormalizationTests(unittest.TestCase):
    def test_accents_and_spacing_are_normalized(self):
        self.assertEqual(normalize_text("Coca Cola 6 × 1,5 L"), "coca cola 6 x 1 5 l")

    def test_size_label_is_compact(self):
        self.assertEqual(normalize_size_label("6 x 1,5 L"), "6x1.5l")

    def test_parse_decimal_handles_french_format(self):
        self.assertEqual(parse_decimal("1,99 €"), 1.99)

    def test_parse_french_date(self):
        parsed = parse_french_date("12 decembre 2026")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.year, 2026)
        self.assertEqual(parsed.month, 12)
        self.assertEqual(parsed.day, 12)

    def test_parse_french_date_range(self):
        start, end = parse_french_date_range("Du 28/07/2026 au 09/08/2026")
        self.assertIsNotNone(start)
        self.assertIsNotNone(end)
        self.assertEqual(start.day, 28)
        self.assertEqual(end.month, 8)

    def test_normalize_url_resolves_and_removes_tracking(self):
        normalized = normalize_url(
            "/catalogues/123?utm_source=fb&cache=123&id=real&fbclid=nope#section",
            "https://example.com/landing/",
        )
        self.assertEqual(normalized, "https://example.com/catalogues/123?id=real")


if __name__ == "__main__":
    unittest.main()
