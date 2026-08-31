import unittest
from decimal import Decimal

from helpers import make_document, make_line
from receipt_scanner.v2 import GenericReceiptParserV2
from receipt_scanner.v2.normalization import (
    declared_count,
    line_count_summary,
    negative_money_value,
)


def simple_generic_receipt():
    return [
        make_line(0, [("MAGASIN TEST", "description", 60)], y=30),
        make_line(1, [("10/07/2026", "description", 60)], y=70),
        make_line(2, [("*** VENTE ***", "description", 60)], y=110),
        make_line(
            3,
            [
                ("PRODUIT A", "description", 60),
                ("1.20", "price", 620),
            ],
            y=160,
        ),
        make_line(
            4,
            [
                ("PRODUIT B", "description", 60),
                ("2.30", "price", 620),
            ],
            y=200,
        ),
        make_line(
            5,
            [
                ("TOTAL 2 ARTICLES", "description", 60),
                ("3.50", "price", 620),
            ],
            y=260,
        ),
        make_line(
            6,
            [
                ("ESPECES", "description", 60),
                ("10.00", "price", 620),
            ],
            y=300,
        ),
        make_line(
            7,
            [
                ("RENDU", "description", 60),
                ("6.50", "price", 620),
            ],
            y=340,
        ),
    ]


def multibuy_generic_receipt():
    return [
        make_line(0, [("VENTE", "description", 60)], y=30),
        make_line(
            1,
            [
                ("RAVIOLI PUR BOEUF", "description", 60),
                ("7.80", "price", 620),
            ],
            y=80,
        ),
        make_line(
            2,
            [("2 x 3.90 EUR", "detail", 100)],
            y=115,
        ),
        make_line(
            3,
            [
                ("VINAIGRE", "description", 60),
                ("1.55", "price", 620),
            ],
            y=160,
        ),
        make_line(
            4,
            [
                ("TOTAL 3 ARTICLES", "description", 60),
                ("9.35", "price", 620),
            ],
            y=220,
        ),
    ]


def leader_price_1795_shape():
    prices = [
        ("PRODUIT A", 1.00),
        ("PRODUIT B", 2.00),
        ("PRODUIT C", 1.50),
        ("PRODUIT D", 3.25),
        ("PRODUIT E", 1.20),
        ("PRODUIT F", 2.50),
        ("PRODUIT G", 2.00),
        ("PRODUIT H", 1.75),
        ("PRODUIT I", 2.75),
    ]
    lines = [
        make_line(0, [("LEADER PRICE", "description", 60)], y=30),
        make_line(1, [("OPERATION VENTE", "description", 60)], y=70),
        make_line(2, [("EPICERIE SUCREE", "description", 60)], y=105),
    ]
    y = 145
    line_id = 3
    for name, price in prices:
        lines.append(
            make_line(
                line_id,
                [
                    (name, "description", 60),
                    (f"{price:.2f}", "price", 620),
                ],
                y=y,
            )
        )
        line_id += 1
        y += 36

    lines.extend(
        [
            make_line(
                line_id,
                [
                    ("SOUS-TOTAL", "description", 60),
                    ("15.00", "price", 620),
                ],
                y=y,
            ),
            make_line(
                line_id + 1,
                [
                    ("TOTAL 9 ARTICLES", "description", 60),
                    ("17.95", "price", 620),
                ],
                y=y + 36,
            ),
            make_line(
                line_id + 2,
                [
                    ("ESPECES", "description", 60),
                    ("20.00", "price", 620),
                ],
                y=y + 72,
            ),
            make_line(
                line_id + 3,
                [
                    ("RENDU", "description", 60),
                    ("2.05", "price", 620),
                ],
                y=y + 108,
            ),
        ]
    )
    return lines


class GenericParserV2FoundationTest(unittest.TestCase):
    def analyze(self, lines):
        document = make_document([])
        document.image_width = 800
        document.image_height = 1600
        return GenericReceiptParserV2().analyze(document, lines)

    def test_total_excludes_payment_and_change(self):
        result = self.analyze(simple_generic_receipt())
        selected = result["selected_hypothesis"]

        self.assertEqual(
            selected["target_total"]["amount"],
            3.5,
        )
        self.assertEqual(selected["items_total"], 3.5)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertEqual(len(selected["items"]), 2)

    def test_multibuy_quantity_is_reconstructed(self):
        result = self.analyze(multibuy_generic_receipt())
        selected = result["selected_hypothesis"]

        self.assertEqual(
            selected["target_total"]["amount"],
            9.35,
        )
        self.assertEqual(selected["items_total"], 9.35)
        self.assertEqual(selected["counted_quantity"], 3)
        ravioli = next(
            item for item in selected["items"]
            if "RAVIOLI" in item["raw_name"]
        )
        self.assertEqual(ravioli["quantity"], 2.0)
        self.assertEqual(ravioli["unit_price"], 3.9)
        self.assertEqual(ravioli["total_price"], 7.8)
        self.assertTrue(ravioli["arithmetic_ok"])

    def test_global_solver_matches_total_and_declared_count(self):
        result = self.analyze(leader_price_1795_shape())
        selected = result["selected_hypothesis"]

        self.assertEqual(
            selected["target_total"]["amount"],
            17.95,
        )
        self.assertEqual(selected["items_total"], 17.95)
        self.assertEqual(selected["counted_quantity"], 9)
        self.assertEqual(len(selected["items"]), 9)
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )

    def test_weekday_discounts_misread_subtotal_and_missing_product_regression(self):
        lines = [
            make_line(0, [("OPERATION VENTE", "description", 60)], y=30),
            make_line(1, [("JUS DE RAISIN 6X20 CL LP", "description", 140), ("3.70", "price", 650)], y=80),
            make_line(2, [("JEUDI 10% MDD", "description", 140)], y=115),
            make_line(3, [("-0.37", "price", 650)], y=150),
            make_line(4, [("MOUCHOIR ETUI STD 15X9 CO", "description", 140), ("2.04", "price", 650)], y=185),
            make_line(5, [("JEUDI 10% MDD", "description", 140)], y=220),
            make_line(6, [("-0.20", "price", 650)], y=255),
            make_line(7, [("HYGIENE", "description", 100), ("1.64", "price", 360)], y=290),
            make_line(8, [("LACTEL LAIT CHEVRE 1.5% M", "description", 140), ("3.18", "price", 650)], y=325),
            make_line(9, [("EMMENTAL RAP 45MG 200G", "description", 140), ("2.45", "price", 650)], y=360),
            make_line(10, [("LAIT 1/2 ECREME UHT 1L", "description", 140), ("1.00", "price", 650)], y=395),
            make_line(11, [("GALETTE BRETONNE 125G LP", "description", 140), ("1.45", "price", 650)], y=430),
            make_line(12, [("JEUDI 10% MDD", "description", 140)], y=465),
            make_line(13, [("-0.15", "price", 650)], y=500),
            make_line(14, [("TAB MILKA LAIT NOISETTES", "description", 140), ("1.69", "price", 650)], y=535),
            make_line(15, [("PRIX PROMOTION", "description", 140)], y=570),
            make_line(16, [("BRI VALEUR QTE", "description", 140), ("-0.04", "price", 650)], y=650),
            make_line(17, [("IVORIA PATE A TARTINER 20", "description", 140), ("2.50", "price", 650)], y=685),
            make_line(18, [("JEUDI 10% MDD", "description", 140)], y=720),
            make_line(19, [("-0.25", "price", 650)], y=755),
            make_line(20, [("TOTAL 8 ARTICLES", "description", 60), ("17.00", "price", 650)], y=810),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]
        names = {item["raw_name"]: item for item in selected["items"]}

        self.assertEqual(selected["items_total"], 17.0)
        self.assertEqual(selected["counted_quantity"], 8)
        self.assertEqual(len(selected["items"]), 8)
        self.assertIn("EMMENTAL RAP 45MG 200G", names)
        self.assertNotIn("HYGIENE", names)
        self.assertEqual(names["JUS DE RAISIN 6X20 CL LP"]["total_price"], 3.33)
        self.assertEqual(names["GALETTE BRETONNE 125G LP"]["total_price"], 1.30)
        self.assertEqual(names["TAB MILKA LAIT NOISETTES"]["total_price"], 1.65)
        self.assertEqual(names["IVORIA PATE A TARTINER 20"]["total_price"], 2.25)
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn("exact_declared_count_match", selected["reasons"])


    def test_classifier_is_not_store_specific(self):
        lines = simple_generic_receipt()
        lines[0] = make_line(
            0,
            [("ENSEIGNE INCONNUE", "description", 60)],
            y=30,
        )
        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["items_total"], 3.5)
        self.assertEqual(len(selected["items"]), 2)


    def test_phone_group_subtotals_weights_and_split_total(self):
        lines = [
            make_line(0, [("MAGASIN INCONNU", "description", 60)], y=20),
            make_line(1, [("Tel : 02.62.34.78.73", "description", 60)], y=55),
            make_line(2, [("OPERATION : VENTE", "description", 60)], y=90),
            make_line(3, [("PRODUIT A", "description", 220), ("2.25", "price", 650)], y=130),
            make_line(4, [("PRODUIT B", "description", 220), ("2.69", "price", 650)], y=165),
            make_line(5, [("PRIX PROMOTION", "description", 220)], y=200),
            make_line(6, [("RAYON A", "description", 60), ("4.94", "price", 360)], y=235),
            make_line(7, [("PRODUIT C", "description", 220), ("0.84", "price", 650)], y=270),
            make_line(8, [("PRODUIT D", "description", 220), ("2.04", "price", 650)], y=305),
            make_line(9, [("RAYON B", "description", 60), ("2.88", "price", 360)], y=340),
            make_line(10, [("PRODUIT E", "description", 220), ("1.99", "price", 650)], y=375),
            make_line(11, [("RAYON C", "description", 60), ("1.99", "price", 360)], y=410),
            make_line(12, [("PRODUIT F", "description", 220), ("2.79", "price", 650)], y=445),
            make_line(13, [("RAYON D", "description", 60), ("2.79", "price", 360)], y=480),
            make_line(14, [("PRODUIT G", "description", 220), ("3.23", "price", 650)], y=515),
            make_line(15, [("RAYON E", "description", 60), ("3.23", "price", 360)], y=550),
            make_line(16, [("PRODUIT H", "description", 220), ("1.98", "price", 650)], y=585),
            make_line(17, [("1.014 kg x 1.95 EUR/kg", "detail", 220)], y=620),
            make_line(18, [("PRODUIT I", "description", 220), ("0.14", "price", 650)], y=655),
            make_line(19, [("0.070 kg x", "detail", 220), ("1.95 EUR/kg", "detail", 420)], y=690),
            make_line(20, [("RAYON F", "description", 60), ("2.12", "price", 360)], y=725),
            make_line(21, [("TOTAL :", "description", 60)], y=780),
            make_line(22, [("17.95 EUR", "price", 650)], y=782),
            make_line(23, [("CARTE BLEUE", "description", 60), ("17.95", "price", 650)], y=820),
            make_line(24, [("NOMBRE ARTICLES : 9", "description", 60)], y=860),
        ]
        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 17.95)
        self.assertEqual(selected["items_total"], 17.95)
        self.assertEqual(selected["counted_quantity"], 9)
        self.assertEqual(len(selected["items"]), 9)
        names = " ".join(item["raw_name"] for item in selected["items"])
        self.assertNotIn("Tel", names)
        self.assertNotIn("RAYON", names)
        weighted = [item for item in selected["items"] if item["item_type"] == "weight"]
        self.assertEqual(len(weighted), 2)


    def test_weight_product_can_cross_isolated_item_code(self):
        lines = [
            make_line(
                0,
                [("ENSEIGNE INCONNUE", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [("OIGNON ROUGE INDE KG", "description", 220)],
                y=80,
            ),
            make_line(
                2,
                [("(1)12679", "description", 60)],
                y=94,
            ),
            make_line(
                3,
                [
                    ("0.070 kg x", "detail", 220),
                    ("1.95 EUR/kg", "detail", 420),
                ],
                y=125,
            ),
            make_line(
                4,
                [("TOTAL :", "description", 60)],
                y=180,
            ),
            make_line(
                5,
                [("0.14 EUR", "price", 650)],
                y=182,
            ),
            make_line(
                6,
                [("NOMBRE ARTICLES : 1", "description", 60)],
                y=235,
            ),
        ]
        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 0.14)
        self.assertEqual(selected["items_total"], 0.14)
        self.assertEqual(selected["counted_quantity"], 1)
        self.assertEqual(len(selected["items"]), 1)

        onion = selected["items"][0]
        self.assertEqual(onion["raw_name"], "OIGNON ROUGE INDE KG")
        self.assertEqual(onion["item_type"], "weight")
        self.assertEqual(onion["unit_price"], 1.95)
        self.assertEqual(onion["total_price"], 0.14)
        self.assertEqual(onion["source_line_ids"], [1, 2, 3])
        self.assertIn(
            "description_code_bridge_then_detail",
            onion["evidence"],
        )
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )



    def test_layout_group_subtotals_are_excluded_when_amount_is_misread(self):
        products = [
            ("(1)1000000000001", "PRODUIT A", 3.94),
            ("(1)1000000000002", "PRODUIT B", 2.70),
            ("(1)1000000000003", "PRODUIT C", 1.70),
            ("(1)1000000000004", "PRODUIT D", 4.40),
            ("(1)1000000000005", "PRODUIT E", 2.04),
            ("(1)1000000000006", "PRODUIT F", 1.70),
            ("(1)1000000000007", "PRODUIT G", 2.25),
        ]

        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [("OPERATION : VENTE", "description", 60)],
                y=55,
            ),
        ]

        line_id = 2
        y = 95
        for code, name, price in products:
            lines.append(
                make_line(
                    line_id,
                    [
                        (code, "description", 55),
                        (name, "description", 245),
                        (f"{price:.2f}", "price", 650),
                    ],
                    y=y,
                )
            )
            line_id += 1
            y += 34

        # True subtotal is 18.73, but OCR has misread it as 10.73.
        lines.append(
            make_line(
                line_id,
                [
                    ("GROUPE A", "description", 55),
                    ("10.73", "price", 360),
                ],
                y=y,
            )
        )
        line_id += 1
        y += 34

        remaining = [
            ("(1)1000000000008", "PRODUIT H", 2.86),
            ("(1)1000000000009", "PRODUIT I", 6.49),
            ("(1)1000000000010", "PRODUIT J", 2.44),
            ("(1)1000000000011", "PRODUIT K", 8.78),
        ]
        subtotals = [2.86, 6.49, 2.44, 8.78]

        for index, ((code, name, price), subtotal) in enumerate(
            zip(remaining, subtotals),
            start=1,
        ):
            lines.append(
                make_line(
                    line_id,
                    [
                        (code, "description", 55),
                        (name, "description", 245),
                        (f"{price:.2f}", "price", 650),
                    ],
                    y=y,
                )
            )
            line_id += 1
            y += 34
            lines.append(
                make_line(
                    line_id,
                    [
                        (f"GROUPE {index + 1}", "description", 55),
                        (f"{subtotal:.2f}", "price", 360),
                    ],
                    y=y,
                )
            )
            line_id += 1
            y += 34

        lines.extend(
            [
                make_line(
                    line_id,
                    [
                        ("TOTAL :", "description", 55),
                        ("39.30", "price", 650),
                    ],
                    y=y,
                ),
                make_line(
                    line_id + 1,
                    [
                        ("NOMBRE ARTICLES : 11", "description", 55),
                    ],
                    y=y + 45,
                ),
            ]
        )

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 39.30)
        self.assertEqual(selected["items_total"], 39.30)
        self.assertEqual(selected["counted_quantity"], 11)
        self.assertEqual(len(selected["items"]), 11)
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )

        names = " ".join(
            item["raw_name"]
            for item in selected["items"]
        )
        self.assertNotIn("GROUPE", names)



    def test_currency_token_does_not_hide_single_item_group_subtotal(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [("OPERATION : VENTE", "description", 60)],
                y=55,
            ),
            make_line(
                2,
                [
                    ("(1)1000000000001", "description", 55),
                    ("PRODUIT A", "description", 245),
                    ("3.94 EUR", "price", 650),
                ],
                y=95,
            ),
            make_line(
                3,
                [
                    ("GROUPE PRECEDENT", "description", 55),
                    ("3.94 EUR", "price", 360),
                ],
                y=130,
            ),
            make_line(
                4,
                [
                    ("(1)1000000000002", "description", 55),
                    ("KALAO THE PECHE 2L", "description", 245),
                    ("2.86 EUR", "price", 650),
                ],
                y=165,
            ),
            make_line(
                5,
                [
                    ("BOISSONS SANS ALCOOL", "description", 55),
                    ("2.86 EUR", "price", 360),
                ],
                y=200,
            ),
            make_line(
                6,
                [
                    ("(1)1000000000003", "description", 55),
                    ("PRODUIT C", "description", 245),
                    ("6.49 EUR", "price", 650),
                ],
                y=235,
            ),
            make_line(
                7,
                [
                    ("GROUPE SUIVANT", "description", 55),
                    ("6.49 EUR", "price", 360),
                ],
                y=270,
            ),
            make_line(
                8,
                [
                    ("TOTAL :", "description", 55),
                    ("13.29 EUR", "price", 650),
                ],
                y=320,
            ),
            make_line(
                9,
                [("NOMBRE ARTICLES : 3", "description", 55)],
                y=365,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 13.29)
        self.assertEqual(selected["items_total"], 13.29)
        self.assertEqual(selected["counted_quantity"], 3)
        self.assertEqual(len(selected["items"]), 3)

        names = " ".join(
            item["raw_name"]
            for item in selected["items"]
        )
        self.assertNotIn("BOISSONS SANS ALCOOL", names)
        self.assertNotIn("GROUPE PRECEDENT", names)
        self.assertNotIn("GROUPE SUIVANT", names)
        self.assertIn("KALAO THE PECHE 2L", names)



    def test_price_only_continuation_with_currency_is_joined(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [
                    ("(1)1000000000001", "description", 55),
                    ("PRODUIT A", "description", 245),
                ],
                y=80,
            ),
            make_line(
                2,
                [("1.70 EUR", "price", 650)],
                y=112,
            ),
            make_line(
                3,
                [
                    ("(1)1000000000002", "description", 55),
                    ("PRODUIT B", "description", 245),
                ],
                y=150,
            ),
            make_line(
                4,
                [("4.40 EUR", "price", 650)],
                y=182,
            ),
            make_line(
                5,
                [
                    ("TOTAL :", "description", 55),
                    ("6.10 EUR", "price", 650),
                ],
                y=235,
            ),
            make_line(
                6,
                [("NOMBRE ARTICLES : 2", "description", 55)],
                y=280,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 6.10)
        self.assertEqual(selected["items_total"], 6.10)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertEqual(len(selected["items"]), 2)
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )

    def test_immediate_negative_adjustments_create_net_item_totals(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [
                    ("(1)1000000000001", "description", 55),
                    ("PRODUIT A", "description", 245),
                    ("1.30 EUR", "price", 650),
                ],
                y=80,
            ),
            make_line(
                2,
                [
                    ("AVANTAGE 10%", "description", 245),
                    ("-0.13 EUR", "price", 650),
                ],
                y=112,
            ),
            make_line(
                3,
                [
                    ("(1)1000000000002", "description", 55),
                    ("PRODUIT B", "description", 245),
                    ("2.04 EUR", "price", 650),
                ],
                y=150,
            ),
            make_line(
                4,
                [
                    ("OFFRE CARTE", "description", 245),
                    ("-0.20 EUR", "price", 650),
                ],
                y=182,
            ),
            make_line(
                5,
                [
                    ("TOTAL :", "description", 55),
                    ("3.01 EUR", "price", 650),
                ],
                y=235,
            ),
            make_line(
                6,
                [("NOMBRE ARTICLES : 2", "description", 55)],
                y=280,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 3.01)
        self.assertEqual(selected["items_total"], 3.01)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertEqual(len(selected["items"]), 2)
        self.assertTrue(
            all(
                "immediate_negative_discount" in item["evidence"]
                for item in selected["items"]
            )
        )
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )



    def test_negative_money_regex_reads_real_minus_sign(self):
        self.assertEqual(
            negative_money_value("-0.18 EUR"),
            Decimal("0.18"),
        )
        self.assertEqual(
            negative_money_value("−0,20 EUR"),
            Decimal("0.20"),
        )

    def test_percentage_context_recovers_unsigned_discount_amount(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [
                    ("(1)1000000000001", "description", 55),
                    ("PRODUIT A", "description", 245),
                    ("1.80 EUR", "price", 650),
                ],
                y=80,
            ),
            make_line(
                2,
                [("AVANTAGE 10%", "description", 245)],
                y=112,
            ),
            # OCR has lost the minus sign here.
            make_line(
                3,
                [("0.18 EUR", "price", 650)],
                y=142,
            ),
            make_line(
                4,
                [
                    ("(1)1000000000002", "description", 55),
                    ("PRODUIT B", "description", 245),
                    ("2.00 EUR", "price", 650),
                ],
                y=185,
            ),
            make_line(
                5,
                [
                    ("TOTAL :", "description", 55),
                    ("3.62 EUR", "price", 650),
                ],
                y=235,
            ),
            make_line(
                6,
                [("NOMBRE ARTICLES : 2", "description", 55)],
                y=280,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 3.62)
        self.assertEqual(selected["items_total"], 3.62)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertEqual(len(selected["items"]), 2)

        discounted = next(
            item
            for item in selected["items"]
            if item["raw_name"] == "PRODUIT A"
        )
        self.assertEqual(discounted["total_price"], 1.62)
        self.assertIn(
            "immediate_negative_discount",
            discounted["evidence"],
        )
        names = " ".join(
            item["raw_name"]
            for item in selected["items"]
        )
        self.assertNotIn("AVANTAGE", names)

    def test_card_payment_can_fallback_as_total_without_cash_guess(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [
                    ("PRODUIT A", "description", 245),
                    ("1.62 EUR", "price", 650),
                ],
                y=80,
            ),
            make_line(
                2,
                [
                    ("PRODUIT B", "description", 245),
                    ("2.00 EUR", "price", 650),
                ],
                y=120,
            ),
            # The printed TOTAL line has been lost by OCR.
            make_line(
                3,
                [
                    ("CARTE BLEUE", "description", 55),
                    ("3.62 EUR", "price", 650),
                ],
                y=180,
            ),
            make_line(
                4,
                [("NOMBRE ARTICLES : 2", "description", 55)],
                y=225,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 3.62)
        self.assertEqual(selected["items_total"], 3.62)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )



    def test_punctuated_total_label_split_from_amount_is_recognized(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [
                    ("PRODUIT A", "description", 245),
                    ("1.62 EUR", "price", 650),
                ],
                y=80,
            ),
            make_line(
                2,
                [
                    ("PRODUIT B", "description", 245),
                    ("2.00 EUR", "price", 650),
                ],
                y=120,
            ),
            # Some two-photo reconstructions place an amount before the label.
            make_line(
                3,
                [("3.62 EUR", "price", 650)],
                y=175,
            ),
            make_line(
                4,
                [("TOTAL.:", "description", 55)],
                y=205,
            ),
            make_line(
                5,
                [("3.62 EUR", "price", 650)],
                y=235,
            ),
            make_line(
                6,
                [("CARTE BLEUE", "description", 55)],
                y=265,
            ),
            make_line(
                7,
                [("NOMBRE ARTICLES : 2", "description", 55)],
                y=310,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 3.62)
        self.assertEqual(selected["items_total"], 3.62)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertEqual(len(selected["items"]), 2)
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )



    def test_article_count_and_product_line_count_are_distinct(self):
        self.assertEqual(
            line_count_summary(
                "Nanbre de lignes d'article 20 | 69,48 EUR"
            ),
            20,
        )
        self.assertIsNone(
            declared_count(
                "Nanbre de lignes d'article 20 | 69,48 EUR"
            )
        )
        self.assertEqual(
            declared_count("TOTAL [24] Articles | 68,11 EUR"),
            24,
        )

    def test_percentage_inside_product_unit_is_not_discount(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [("BUP CALIN 20%MG 500G NAT", "description", 220)],
                y=80,
            ),
            make_line(
                2,
                [("1 x 2.79 EUR", "price", 620)],
                y=112,
            ),
            make_line(
                3,
                [
                    ("TOTAL 1 ARTICLE", "description", 60),
                    ("2.79 EUR", "price", 620),
                ],
                y=170,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["items_total"], 2.79)
        self.assertEqual(selected["counted_quantity"], 1)
        self.assertEqual(len(selected["items"]), 1)
        self.assertEqual(
            selected["items"][0]["raw_name"],
            "BUP CALIN 20%MG 500G NAT",
        )

    def test_repeated_detail_price_is_not_attached_to_next_section(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [
                    ("TIC TAC BERRY MIX 18G", "description", 220),
                    ("1.39 EUR", "price", 620),
                ],
                y=80,
            ),
            make_line(
                2,
                [("1 x 1.39 EUR", "price", 620)],
                y=112,
            ),
            make_line(
                3,
                [("COUSCOUS PUREE LEG SECS BLE", "description", 60)],
                y=145,
            ),
            make_line(
                4,
                [
                    ("PUREE MOUSLINE 520G", "description", 220),
                    ("3.10 EUR", "price", 620),
                ],
                y=180,
            ),
            make_line(
                5,
                [
                    ("TOTAL 2 ARTICLES", "description", 60),
                    ("4.49 EUR", "price", 620),
                ],
                y=235,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]
        names = [
            item["raw_name"]
            for item in selected["items"]
        ]

        self.assertEqual(selected["items_total"], 4.49)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertNotIn("COUSCOUS PUREE LEG SECS BLE", names)

    def test_staggered_total_on_line_count_summary_is_preferred(self):
        lines = [
            make_line(
                0,
                [("MAGASIN INCONNU", "description", 60)],
                y=20,
            ),
            make_line(
                1,
                [
                    ("PRODUIT A", "description", 220),
                    ("1.39 EUR", "price", 620),
                ],
                y=80,
            ),
            make_line(
                2,
                [
                    ("PRODUIT B", "description", 220),
                    ("2.79 EUR", "price", 620),
                ],
                y=120,
            ),
            make_line(
                3,
                [
                    ("Nanbre de lignes d'article 2", "description", 60),
                    ("4.18 EUR", "price", 620),
                ],
                y=175,
            ),
            make_line(
                4,
                [
                    ("TOTAL [2] Articles", "description", 60),
                    ("4.00 EUR", "price", 620),
                ],
                y=210,
            ),
            make_line(
                5,
                [
                    ("SOUS-TOTAL", "description", 60),
                    ("0.18 EUR", "price", 620),
                ],
                y=245,
            ),
        ]

        result = self.analyze(lines)
        selected = result["selected_hypothesis"]

        self.assertEqual(selected["target_total"]["amount"], 4.18)
        self.assertEqual(selected["items_total"], 4.18)
        self.assertEqual(selected["counted_quantity"], 2)
        self.assertIn("exact_total_match", selected["reasons"])
        self.assertIn(
            "exact_declared_count_match",
            selected["reasons"],
        )



if __name__ == "__main__":
    unittest.main()


class GenericParserV2Phase13RegressionTest(unittest.TestCase):
    def analyze(self, lines):
        document = make_document([])
        document.image_width = 800
        document.image_height = 1800
        return GenericReceiptParserV2().analyze(document, lines)

    def test_title_case_total_is_not_selected_as_product(self):
        lines = [
            make_line(0, [("AUCHAN", "description", 60)], y=30),
            make_line(1, [("BANANE", "description", 60), ("1.46", "price", 620)], y=90),
            make_line(2, [("YAOURT", "description", 60), ("3.13", "price", 620)], y=130),
            make_line(3, [("Total", "description", 60), ("4.59", "price", 620)], y=190),
            make_line(4, [("Brut", "description", 60), ("4.59", "price", 620)], y=230),
        ]
        selected = self.analyze(lines)["selected_hypothesis"]
        self.assertEqual(selected["target_total"]["amount"], 4.59)
        self.assertEqual(selected["items_total"], 4.59)
        self.assertEqual(len(selected["items"]), 2)

    def test_pack_size_is_not_interpreted_as_multibuy_quantity(self):
        lines = [
            make_line(0, [("SUPER U", "description", 60)], y=30),
            make_line(1, [("EAU MINERALE 6X1,25L", "description", 60), ("6.87", "price", 620)], y=90),
            make_line(2, [("TOTAL 1 ARTICLE", "description", 60), ("6.87", "price", 620)], y=150),
        ]
        selected = self.analyze(lines)["selected_hypothesis"]
        self.assertEqual(selected["counted_quantity"], 1)
        self.assertEqual(selected["items"][0]["quantity"], 1.0)

    def test_payable_total_keeps_gross_items_when_declared_count_is_exact(self):
        lines = [
            make_line(0, [("SUPER U", "description", 60)], y=30),
            make_line(1, [("PRODUIT A", "description", 60), ("30.00", "price", 620)], y=90),
            make_line(2, [("PRODUIT B", "description", 60), ("20.00", "price", 620)], y=130),
            make_line(3, [("PRODUIT C", "description", 60), ("34.95", "price", 620)], y=170),
            make_line(4, [("TOTAL 3 ARTICLES", "description", 60), ("84.95", "price", 620)], y=230),
            make_line(5, [("VOS REDUCTIONS IMMEDIATES", "description", 60), ("-5.88", "price", 620)], y=270),
            make_line(6, [("RESTE A PAYER", "description", 60), ("79.07", "price", 620)], y=310),
        ]
        selected = self.analyze(lines)["selected_hypothesis"]
        self.assertEqual(selected["target_total"]["kind"], "payable")
        self.assertEqual(selected["target_total"]["amount"], 79.07)
        self.assertEqual(selected["items_total"], 84.95)
        self.assertEqual(selected["counted_quantity"], 3)
        self.assertEqual(len(selected["items"]), 3)

    def test_deee_breakdown_reconstructs_corrupted_product_price(self):
        lines = [
            make_line(0, [("E.LECLERC", "description", 60)], y=30),
            make_line(1, [("CHARGEUR RAPIDE USBC", "description", 60), ("22.90", "price", 620)], y=90),
            make_line(2, [("DONT DEEE", "description", 60), ("0.04", "price", 620)], y=125),
            make_line(3, [("PRIX HORS CONTRIBUTIONS", "description", 60), ("22.86", "price", 620)], y=160),
            make_line(4, [("SAMSUNG A17 128GO", "description", 60), ("1683.00", "price", 620)], y=210),
            make_line(5, [("DONT DEEE", "description", 60), ("2.54", "price", 620)], y=245),
            make_line(6, [("PRIX HORS CONTRIBUTIONS", "description", 60), ("165.46", "price", 620)], y=280),
            make_line(7, [("TOTAL TTC", "description", 60), ("190.90", "price", 620)], y=340),
        ]
        selected = self.analyze(lines)["selected_hypothesis"]
        self.assertEqual(selected["target_total"]["amount"], 190.90)
        self.assertEqual(selected["items_total"], 190.90)
        self.assertEqual(len(selected["items"]), 2)
        samsung = next(item for item in selected["items"] if "SAMSUNG" in item["raw_name"])
        self.assertEqual(samsung["total_price"], 168.0)


