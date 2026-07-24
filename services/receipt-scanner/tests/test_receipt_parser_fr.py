import unittest

from helpers import make_document, make_line
from receipt_scanner.receipt_parser_fr import ReceiptParserFR


def coherent_short_receipt_lines():
    lines = [
        make_line(0, [("E.LECLERC", "description", 70)], y=40),
        make_line(1, [("LE PORTAIL", "description", 70)], y=80),
        make_line(
            2,
            [
                ("17/07/2026", "description", 70),
                ("14:13", "description", 210),
            ],
            y=120,
        ),
        make_line(
            3,
            [
                ("DESIGNATION", "description", 70),
                ("TTC", "price", 620),
                ("TVA", "vat", 730),
            ],
            y=180,
        ),
        make_line(4, [(">> EPICERIE", "description", 70)], y=230),
        make_line(
            5,
            [
                ("CORNICHONS 72 CL,360G", "description", 70),
                ("1.90", "price", 620),
                ("1", "vat", 730),
            ],
            y=280,
        ),
        make_line(
            6,
            [("TORTILLAS NATURE TOKAPI 150G", "description", 70)],
            y=330,
        ),
        make_line(
            7,
            [
                ("2 X 1.56€", "detail", 70),
                ("3.12", "price", 620),
                ("2", "vat", 730),
            ],
            y=370,
        ),
        make_line(
            8,
            [(">> FRUITS ET LEGUMES", "description", 70)],
            y=430,
        ),
        make_line(
            9,
            [("POMME GRANNY SMITH", "description", 70)],
            y=480,
        ),
        make_line(
            10,
            [
                ("0.648 kg X 1.99 /kg", "detail", 70),
                ("1.29", "price", 620),
                ("2", "vat", 730),
            ],
            y=520,
        ),
        make_line(
            11,
            [(">> CREMERIE", "description", 70)],
            y=580,
        ),
    ]
    prices = [
        1.94,
        1.53,
        1.90,
        1.79,
        1.92,
        2.51,
        2.25,
        1.75,
        2.73,
        2.27,
        2.33,
        2.99,
        1.16,
        3.99,
        2.90,
        4.41,
        3.90,
    ]
    y = 630
    for index, price in enumerate(prices, start=12):
        lines.append(
            make_line(
                index,
                [
                    (
                        f"PRODUIT TEST {index}",
                        "description",
                        70,
                    ),
                    (f"{price:.2f}", "price", 620),
                    ("2", "vat", 730),
                ],
                y=y,
            )
        )
        y += 42

    lines.append(
        make_line(
            40,
            [
                ("TOTAL 21 ARTICLES", "description", 70),
                ("48.58", "price", 620),
            ],
            y=y + 30,
        )
    )
    return lines


def total_lines(*extra_lines: tuple[str, str]) -> list:
    lines = [
        make_line(0, [("E.LECLERC", "description", 70)], y=40),
        make_line(1, [("LE PORTAIL", "description", 70)], y=80),
        make_line(2, [(">> EPICERIE", "description", 70)], y=130),
        make_line(
            3,
            [
                ("PRODUIT TEST", "description", 70),
                ("74.24", "price", 620),
            ],
            y=180,
        ),
        make_line(
            4,
            [
                ("TOTAL 33 ARTICLES", "description", 70),
                ("74.24", "price", 620),
            ],
            y=230,
        ),
    ]
    for index, (label, amount) in enumerate(
        extra_lines,
        start=5,
    ):
        parts = [(label, "description", 70)]
        if amount:
            parts.append((amount, "price", 620))
        lines.append(
            make_line(
                index,
                parts,
                y=230 + ((index - 4) * 42),
            )
        )
    return lines


def leader_price_simple_lines():
    return [
        make_line(
            100,
            [("LEADER PRICE SAINT LEU", "description", 70)],
            y=40,
        ),
        make_line(
            101,
            [("150, Rue du General Lambert", "description", 70)],
            y=80,
        ),
        make_line(
            102,
            [("97436 SAINT-LEU", "description", 70)],
            y=120,
        ),
        make_line(
            103,
            [
                ("22/07/2026", "description", 70),
                ("12:33:32", "description", 210),
            ],
            y=160,
        ),
        make_line(
            104,
            [("OPERATION : VENTE", "description", 70)],
            y=200,
        ),
        make_line(
            105,
            [
                (
                    "(1)3278732201331 FANTA ORANGE PET 50CL",
                    "description",
                    70,
                ),
                ("1.30 EUR", "price", 620),
            ],
            y=240,
        ),
        make_line(
            106,
            [
                (
                    "(1)5449000297280 C-COLA REG PET 50CL",
                    "description",
                    70,
                ),
                ("1.29 EUR", "price", 620),
            ],
            y=280,
        ),
        make_line(
            107,
            [
                (
                    "(1)5410041001204 TUC ORIGINAL 100G",
                    "description",
                    70,
                ),
                ("1.73 EUR", "price", 620),
            ],
            y=320,
        ),
        make_line(
            108,
            [
                ("TOTAL :", "description", 70),
                ("4.32 EUR", "price", 620),
            ],
            y=380,
        ),
        make_line(
            109,
            [
                ("ESPECES", "description", 70),
                ("10.00 EUR", "price", 620),
            ],
            y=420,
        ),
        make_line(
            110,
            [
                ("RENDU (ESPECES)", "description", 70),
                ("5.68 EUR", "price", 620),
            ],
            y=460,
        ),
        make_line(
            111,
            [("NOMBRE ARTICLES : 3", "description", 70)],
            y=520,
        ),
    ]


def leader_price_weight_lines():
    return [
        make_line(
            120,
            [("LEADER", "description", 70)],
            y=20,
        ),
        make_line(
            121,
            [("PRICE", "description", 70)],
            y=35,
        ),
        make_line(
            122,
            [("LEADER PRICE SAINT LEU", "description", 70)],
            y=60,
        ),
        make_line(
            123,
            [
                ("22/07/2026", "description", 70),
                ("18:07:24", "description", 210),
            ],
            y=100,
        ),
        make_line(
            124,
            [("OPERATION : VENTE", "description", 70)],
            y=140,
        ),
        make_line(
            125,
            [
                (
                    "(1)8005391612964 PUREE DE TOMATES 680G",
                    "description",
                    70,
                ),
                ("1.00 EUR", "price", 620),
            ],
            y=180,
        ),
        make_line(
            126,
            [("PRIX PROMOTION", "description", 70)],
            y=220,
        ),
        make_line(
            127,
            [
                ("(1)12738 CAROTTE CHINE KG", "description", 70),
                ("0.38 EUR", "price", 620),
            ],
            y=260,
        ),
        make_line(
            128,
            [("0.210 k9 x 1.80 EUR/kg", "detail", 70)],
            y=300,
        ),
        make_line(
            129,
            [
                (
                    "(1)12679 OIGNON ROUGE INDE KG",
                    "description",
                    70,
                ),
                ("0.62 EUR", "price", 620),
            ],
            y=340,
        ),
        make_line(
            130,
            [("0.364 kg x 1.70 EUR/kg", "detail", 70)],
            y=380,
        ),
        make_line(
            131,
            [
                (
                    "(1)3178530422412 225G GOUTER FOURRES CHOCO",
                    "description",
                    70,
                ),
                ("2.25 EUR", "price", 620),
            ],
            y=420,
        ),
        make_line(
            132,
            [
                (
                    "(1)299991033580 BOUCHERJE COUPE",
                    "description",
                    70,
                ),
                ("5.12 EUR", "price", 620),
            ],
            y=460,
        ),
        make_line(
            133,
            [
                ("TOTAL :", "description", 70),
                ("9.37 EUR", "price", 620),
            ],
            y=520,
        ),
        make_line(
            134,
            [
                ("CARTE BLEUE", "description", 70),
                ("9.37 EUR", "price", 620),
            ],
            y=560,
        ),
        make_line(
            135,
            [("NOMBRE ARTICLES : 5", "description", 70)],
            y=620,
        ),
    ]


class ReceiptParserFRTest(unittest.TestCase):
    def test_short_receipt_case_a_is_parsed_without_private_photo(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            coherent_short_receipt_lines(),
        )

        self.assertEqual(parsed.store_name, "E.Leclerc")
        self.assertEqual(parsed.store_location, "LE PORTAIL")
        self.assertEqual(parsed.declared_item_count, 21)
        self.assertEqual(parsed.total, 48.58)
        self.assertEqual(len(parsed.items), 20)
        self.assertEqual(parsed.counted_quantity, 21)
        self.assertEqual(parsed.items_total, 48.58)
        self.assertEqual(
            parsed.excluded_sections,
            [
                "EPICERIE",
                "FRUITS ET LEGUMES",
                "CREMERIE",
            ],
        )

    def test_immediate_discount_uses_final_paid_total(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            total_lines(
                ("BON IMMEDIAT", "0.25"),
                ("RESTE A PAYER", "73.99"),
                ("CB", "73.99"),
            ),
        )

        self.assertEqual(parsed.article_total, 74.24)
        self.assertEqual(parsed.immediate_discount_total, 0.25)
        self.assertEqual(parsed.payable_total, 73.99)
        self.assertEqual(parsed.total, 73.99)
        self.assertEqual(
            parsed.article_reconciliation_total,
            74.24,
        )

    def test_future_voucher_does_not_reduce_budget_total(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            total_lines(
                ("BON ACHAT PROCHAIN PASSAGE", "5.00"),
                ("CB", "74.24"),
            ),
        )

        self.assertEqual(parsed.total, 74.24)
        self.assertEqual(parsed.article_total, 74.24)
        self.assertIsNone(parsed.immediate_discount_total)

    def test_cash_tender_and_change_do_not_override_article_total(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            total_lines(
                ("ESPECES", "80.00"),
                ("RENDU", "5.76"),
            ),
        )

        self.assertEqual(parsed.total, 74.24)
        self.assertEqual(parsed.article_total, 74.24)

    def test_split_payment_keeps_explicit_total_to_pay(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            total_lines(
                ("TOTAL A PAYER", "73.99"),
                ("CB", "50.00"),
                ("ESPECES", "23.99"),
            ),
        )

        self.assertEqual(parsed.total, 73.99)
        self.assertEqual(parsed.payable_total, 73.99)

    def test_contradictory_discount_total_requires_manual_total_review(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            total_lines(
                ("BON IMMEDIAT", "0.25"),
                ("RESTE A PAYER", "72.99"),
            ),
        )

        self.assertIsNone(parsed.total)
        self.assertEqual(parsed.article_total, 74.24)
        self.assertEqual(parsed.immediate_discount_total, 0.25)
        self.assertEqual(parsed.payable_total, 72.99)
        self.assertTrue(
            any(
                "contradictoire" in warning
                for warning in parsed.warnings
            )
        )

    def test_unreadable_immediate_discount_amount_does_not_invent_discount(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            total_lines(
                ("BON IMMEDIAT", ""),
                ("CB", "74.24"),
            ),
        )

        self.assertEqual(parsed.total, 74.24)
        self.assertIsNone(parsed.immediate_discount_total)

    def test_multibuy_line_preserves_quantity_unit_and_total(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            coherent_short_receipt_lines(),
        )
        item = next(
            item
            for item in parsed.items
            if item.item_type == "multibuy"
        )

        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.unit_price, 1.56)
        self.assertEqual(item.total_price, 3.12)

    def test_weight_item_preserves_weight_price_per_kg_and_total(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            coherent_short_receipt_lines(),
        )
        item = next(
            item
            for item in parsed.items
            if item.item_type == "weight"
        )

        self.assertEqual(item.weight_kg, 0.648)
        self.assertEqual(item.price_per_kg, 1.99)
        self.assertEqual(item.total_price, 1.29)

    def test_section_header_does_not_become_an_item(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            coherent_short_receipt_lines(),
        )
        names = [item.raw_name for item in parsed.items]

        self.assertNotIn("EPICERIE", names)
        self.assertNotIn("FRUITS ET LEGUMES", names)


class ReceiptParserFRMultiStoreTest(unittest.TestCase):
    def test_leader_price_without_section_headers_is_parsed(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            leader_price_simple_lines(),
        )

        self.assertEqual(parsed.store_name, "Leader Price")
        self.assertEqual(parsed.store_location, "Saint Leu")
        self.assertEqual(parsed.receipt_date, "2026-07-22")
        self.assertEqual(parsed.declared_item_count, 3)
        self.assertEqual(parsed.total, 4.32)
        self.assertEqual(len(parsed.items), 3)
        self.assertEqual(parsed.items_total, 4.32)
        self.assertNotIn(
            "ESPECES",
            [item.raw_name for item in parsed.items],
        )
        self.assertNotIn(
            "RENDU (ESPECES)",
            [item.raw_name for item in parsed.items],
        )

    def test_weight_ocr_k9_is_corrected_contextually(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            leader_price_weight_lines(),
        )

        carrot = next(
            item
            for item in parsed.items
            if item.raw_name == "CAROTTE CHINE KG"
        )

        self.assertEqual(carrot.item_type, "weight")
        self.assertEqual(carrot.quantity, 1.0)
        self.assertEqual(carrot.weight_kg, 0.210)
        self.assertEqual(carrot.price_per_kg, 1.80)
        self.assertEqual(carrot.total_price, 0.38)
        self.assertFalse(carrot.needs_review)
        self.assertEqual(
            carrot.raw_detail,
            "0.210 kg x 1.80 EUR/kg",
        )

    def test_common_product_word_typo_is_corrected_but_generic_line_stays_review(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            leader_price_weight_lines(),
        )

        generic_line = next(
            item
            for item in parsed.items
            if item.raw_name == "BOUCHERIE COUPE"
        )

        self.assertEqual(
            generic_line.item_type,
            "generic_department",
        )
        self.assertTrue(generic_line.needs_review)

    def test_weight_ticket_count_and_total_are_reconciled(
        self,
    ) -> None:
        parsed = ReceiptParserFR().parse(
            make_document([]),
            leader_price_weight_lines(),
        )

        self.assertEqual(parsed.store_location, "Saint Leu")
        self.assertEqual(parsed.total, 9.37)
        self.assertEqual(parsed.declared_item_count, 5)
        self.assertEqual(len(parsed.items), 5)
        self.assertEqual(parsed.counted_quantity, 5)
        self.assertEqual(parsed.items_total, 9.37)
        self.assertFalse(
            any(
                "Quantité reconstruite" in warning
                for warning in parsed.warnings
            )
        )

    def test_generic_carrefour_style_without_sections_is_parsed(
        self,
    ) -> None:
        lines = [
            make_line(
                140,
                [
                    (
                        "CARREFOUR MARKET SAINT DENIS",
                        "description",
                        70,
                    )
                ],
                y=40,
            ),
            make_line(
                141,
                [
                    ("23/07/2026", "description", 70),
                    ("09:10", "description", 210),
                ],
                y=80,
            ),
            make_line(
                142,
                [("ARTICLES", "description", 70)],
                y=120,
            ),
            make_line(
                143,
                [
                    ("LAIT DEMI ECREME 1L", "description", 70),
                    ("1.20", "price", 620),
                ],
                y=160,
            ),
            make_line(
                144,
                [
                    ("PAIN COMPLET 500G", "description", 70),
                    ("1.80", "price", 620),
                ],
                y=200,
            ),
            make_line(
                145,
                [
                    ("TOTAL TTC", "description", 70),
                    ("3.00", "price", 620),
                ],
                y=260,
            ),
            make_line(
                146,
                [
                    ("CB", "description", 70),
                    ("3.00", "price", 620),
                ],
                y=300,
            ),
            make_line(
                147,
                [("NB ARTICLES : 2", "description", 70)],
                y=340,
            ),
        ]

        parsed = ReceiptParserFR().parse(
            make_document([]),
            lines,
        )

        self.assertEqual(parsed.store_name, "Carrefour Market")
        self.assertEqual(parsed.total, 3.00)
        self.assertEqual(parsed.declared_item_count, 2)
        self.assertEqual(len(parsed.items), 2)
        self.assertEqual(parsed.items_total, 3.00)


if __name__ == "__main__":
    unittest.main()


class ReceiptParserFRPhase13IdentityTest(unittest.TestCase):
    def parse(self, lines):
        return ReceiptParserFR().parse(make_document([]), lines)

    def test_carrefour_contact_and_footer_date_are_recovered(self):
        lines = [
            make_line(0, [("contact", "description", 70)], y=40),
            make_line(1, [("CONTACT ST SAUVEUR", "description", 70)], y=80),
            make_line(2, [("PRODUIT", "description", 70), ("21.54", "price", 620)], y=150),
            make_line(3, [("TOTAL A PAYER", "description", 70), ("21.54", "price", 620)], y=210),
            make_line(4, [("17/06/2025", "description", 70), ("18:04:15", "description", 250)], y=700),
        ]
        parsed = self.parse(lines)
        self.assertEqual(parsed.store_name, "Carrefour Contact")
        self.assertEqual(parsed.receipt_date, "2025-06-17")

    def test_carrefour_market_split_logo_is_normalized(self):
        lines = [
            make_line(0, [("Carrefour", "description", 70)], y=40),
            make_line(1, [("market", "description", 70)], y=75),
            make_line(2, [("28/10/2024", "description", 70)], y=600),
            make_line(3, [("TOTAL A PAYER", "description", 70), ("12.61", "price", 620)], y=650),
        ]
        parsed = self.parse(lines)
        self.assertEqual(parsed.store_name, "Carrefour Market")
        self.assertEqual(parsed.receipt_date, "2024-10-28")

    def test_isolated_u_logo_is_normalized_as_super_u(self):
        lines = [
            make_line(0, [("U", "description", 70)], y=40),
            make_line(1, [("COMMERCANTS AUTREMENT", "description", 70)], y=75),
            make_line(2, [("20/01/24", "description", 70)], y=110),
            make_line(3, [("TOTAL", "description", 70), ("79.07", "price", 620)], y=650),
        ]
        parsed = self.parse(lines)
        self.assertEqual(parsed.store_name, "Super U")
        self.assertEqual(parsed.receipt_date, "2024-01-20")

    def test_textual_date_wins_over_noisy_numeric_duplicate(self):
        lines = [
            make_line(0, [("E.LECLERC", "description", 70)], y=40),
            make_line(1, [("24 jui11et 2026 17:41", "description", 70)], y=90),
            make_line(2, [("Ticket 24/07/25", "description", 70)], y=130),
            make_line(3, [("TOTAL", "description", 70), ("54.87", "price", 620)], y=650),
        ]
        parsed = self.parse(lines)
        self.assertEqual(parsed.receipt_date, "2026-07-24")


