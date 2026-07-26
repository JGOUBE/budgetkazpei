from __future__ import annotations

import unittest

from receipt_scanner.market_resolver import _build_ocr_alias_alternate_names


class MarketResolverAliasNormalizationTest(unittest.TestCase):
    def test_tarama_ocr_variants_build_food_context_alternates(self) -> None:
        alternates = _build_ocr_alias_alternate_names(
            "TARAMA DEUFS CABIL,I00G"
        )
        self.assertEqual(
            alternates,
            [
                "TARAMA DEUFS CABIL,100G",
                "TARAMA OEUFS CABIL,I00G",
                "TARAMA OEUFS CABIL,100G",
            ],
        )

    def test_oeufs_replacement_stays_disabled_without_food_context(self) -> None:
        alternates = _build_ocr_alias_alternate_names("DEUFS SERVICE I00G")
        self.assertEqual(alternates, ["DEUFS SERVICE 100G"])


if __name__ == "__main__":
    unittest.main()
