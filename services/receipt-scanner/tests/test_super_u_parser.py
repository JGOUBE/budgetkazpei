import unittest

from helpers import make_document, make_line
from receipt_scanner.receipt_parser_fr import ReceiptParserFR


def super_u_repaired_lines():
    lines = [
        make_line(0, [("SUPERU", "description", 237)], y=40),
        make_line(1, [("PITON ST LEU", "description", 369)], y=100),
        make_line(2, [("*** VENTE ***", "description", 364)], y=160),
        make_line(3, [("CAFE", "description", 165)], y=200),
        make_line(
            4,
            [
                ("CAFE EXT.FILT.LVOPHILISE U100G", "description", 162),
                ("5.39 € 11", "description", 594),
            ],
            y=240,
        ),
        make_line(5, [("5,39 EUR", "detail", 372)], y=270),
        make_line(
            6,
            [
                ("MUESLI CROUSTIL.3 CHOCO.U 500G", "description", 166),
                ("3,75 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=310,
        ),
        make_line(7, [("3,75 EUR", "detail", 376)], y=340),
        make_line(
            8,
            [
                ("ICROUST CHOCO.LTU 500G", "description", 168),
                ("3,85 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=380,
        ),
        make_line(9, [("3,85 EUR", "detail", 378)], y=410),
        make_line(
            10,
            [
                ("KNACK IER PRIX X20", "description", 169),
                ("3,95 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=450,
        ),
        make_line(
            11,
            [
                ("1 x", "description", 281),
                ("3,95 EUR", "detail", 380),
            ],
            y=480,
        ),
        make_line(
            12,
            [
                ("TIC TAC BERRY MIX 18G", "description", 170),
                ("1,39 €", "price", 620),
                ("13", "vat", 730),
            ],
            y=520,
        ),
        make_line(
            13,
            [
                ("PUREE MOUSLINE 520G", "description", 172),
                ("3,10 €", "price", 620),
            ],
            y=560,
        ),
        make_line(
            14,
            [
                ("1 x", "description", 281),
                ("3,10 EUR", "detail", 380),
            ],
            y=590,
        ),
        make_line(
            15,
            [
                ("PETIT BENARE 150G", "description", 172),
                ("2,89 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=630,
        ),
        make_line(
            16,
            [
                ("1 x", "description", 281),
                ("2,89 EUR", "detail", 380),
            ],
            y=660,
        ),
        make_line(
            17,
            [
                ("BOP BOURBON HUILE TOURNESOL L", "description", 172),
                ("2,44 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=700,
        ),
        make_line(
            18,
            [
                ("Ix", "description", 281),
                ("2.,44 EUR", "detail", 380),
            ],
            y=730,
        ),
        make_line(
            19,
            [
                ("LAIT UHT 1/2EC LAIT D'ICI BK1L", "description", 173),
                ("4,76 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=770,
        ),
        make_line(
            20,
            [
                ("4 X", "description", 290),
                ("1,19 EUR", "detail", 390),
                ("2,59 €", "price", 620),
                ("11", "vat", 730),
            ],
            y=800,
        ),
        make_line(
            21,
            [("SP.LAIT.FLUIDE UHT58MG U3X20CL", "description", 170)],
            y=830,
        ),
        make_line(
            22,
            [
                ("1 x", "description", 290),
                ("2,59 EUR", "detail", 390),
            ],
            y=860,
        ),
        make_line(
            23,
            [
                ("BOP DOUPLI MOUCH POCK 3P X10", "description", 168),
                ("1,00 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=900,
        ),
        make_line(
            24,
            [
                ("1 x", "description", 290),
                ("1,00 EUR", "detail", 390),
            ],
            y=930,
        ),
        make_line(
            25,
            [
                ("PARFUMERIE", "description", 168),
                ("BROSSE GLAMOUR DEMELAGE FACILE", "description", 300),
                ("5,99 €", "description", 620),
                ("13", "price", 730),
            ],
            y=970,
        ),
        make_line(
            26,
            [
                ("1 x", "description", 290),
                ("5,99 EUR", "detail", 390),
                ("3,25 €", "price", 620),
                ("13", "vat", 730),
            ],
            y=1000,
        ),
        make_line(
            27,
            [("GL DCH.BAMBOU&ALOE VER.U 750ML", "description", 168)],
            y=1030,
        ),
        make_line(
            28,
            [
                ("1 x", "description", 290),
                ("3,25 EUR", "detail", 390),
            ],
            y=1060,
        ),
        make_line(
            29,
            [
                ("PATES", "description", 155),
                ("COOUILLETTES Q.SUP.U CELLO 1KG", "description", 250),
                ("1,75 €", "price", 620),
                ("11", "vat", 730),
            ],
            y=1100,
        ),
        make_line(
            30,
            [
                ("1 x", "description", 280),
                ("1,75 EUR", "detail", 390),
            ],
            y=1130,
        ),
        make_line(
            31,
            [
                ("SAUCE TOMATE FRAICHES U 2X190G", "description", 144),
                ("1,85 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=1170,
        ),
        make_line(
            32,
            [
                ("1 x", "description", 280),
                ("1,85 EUR", "detail", 390),
            ],
            y=1200,
        ),
        make_line(
            33,
            [
                ("1 x", "description", 280),
                ("1,85 EUR", "detail", 390),
            ],
            y=1230,
        ),
        make_line(
            34,
            [
                ("Q.CREV TROP DEV 13/15 VANNAMEI", "description", 144),
                ("5,10 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=1270,
        ),
        make_line(
            35,
            [
                ("2 x", "description", 280),
                ("2,55 EUR", "detail", 390),
            ],
            y=1300,
        ),
        make_line(
            36,
            [
                ("SAUMON SAUVAGE PAVE S/P 2X125G", "description", 144),
                ("3,85 €", "price", 620),
                ("11", "vat", 730),
            ],
            y=1340,
        ),
        make_line(
            37,
            [
                ("1 x", "description", 280),
                ("3,85 EUR", "detail", 390),
            ],
            y=1370,
        ),
        make_line(
            38,
            [
                ("SURGELE SUCRE", "description", 144),
                ("BAT.SORB.MULTIFRUIT.OASIS 400G", "description", 300),
                ("5,50 €", "price", 620),
                ("11", "vat", 730),
            ],
            y=1410,
        ),
        make_line(
            39,
            [
                ("1 x", "description", 280),
                ("5,50 EUR", "detail", 390),
            ],
            y=1440,
        ),
        make_line(
            40,
            [
                ("ULTRA FRAIS", "description", 144),
                ("4,29 €", "price", 620),
                ("11", "vat", 730),
            ],
            y=1480,
        ),
        make_line(
            41,
            [
                ("BQP YOPLAIT", "description", 144),
                ("AROM/ILES 12X125G", "description", 320),
            ],
            y=1510,
        ),
        make_line(
            42,
            [
                ("1 x", "description", 280),
                ("4,29 EUR", "detail", 390),
                ("2,79 €", "price", 620),
                ("0", "vat", 730),
            ],
            y=1540,
        ),
        make_line(
            43,
            [("BUP CALIN 20%MG 500G NAT", "description", 144)],
            y=1570,
        ),
        make_line(
            44,
            [
                ("1 x", "description", 280),
                ("2,79 EUR", "detail", 390),
            ],
            y=1600,
        ),
        make_line(
            45,
            [
                ("Nanbre de lignes d'article 20", "description", 144),
                ("69,48 €", "price", 620),
            ],
            y=1640,
        ),
        make_line(
            46,
            [
                ("TOTAL [24] Articles", "description", 144),
                ("68,11 €", "price", 620),
            ],
            y=1670,
        ),
        make_line(
            47,
            [
                ("SOUS-TOTAL", "description", 144),
                ("1,37 €", "price", 620),
            ],
            y=1700,
        ),
        make_line(
            48,
            [
                ("TOTAL TVA", "description", 144),
                ("Dont articles éligibles TR", "description", 320),
                ("57,85 €", "price", 620),
            ],
            y=1730,
        ),
        make_line(
            49,
            [
                ("ESPECES", "description", 144),
                ("70,00 €", "price", 620),
            ],
            y=1760,
        ),
        make_line(
            50,
            [
                ("RENDU ESPECES", "description", 144),
                ("0,52 €", "price", 620),
            ],
            y=1790,
        ),
    ]
    return lines


class SuperUReceiptParserTest(unittest.TestCase):
    def test_super_u_two_photo_staggered_rows_are_reconciled(self):
        parsed = ReceiptParserFR().parse(
            make_document([]),
            super_u_repaired_lines(),
        )

        self.assertEqual(parsed.store_name, "Super U")
        self.assertEqual(parsed.store_location, "Piton Saint-Leu")
        self.assertIsNone(parsed.receipt_date)
        self.assertEqual(parsed.declared_item_count, 24)
        self.assertEqual(parsed.total, 69.48)
        self.assertEqual(parsed.article_total, 69.48)
        self.assertEqual(len(parsed.items), 20)
        self.assertEqual(parsed.counted_quantity, 24)
        self.assertEqual(parsed.items_total, 69.48)
        self.assertEqual(parsed.warnings, [])

        milk = next(
            item
            for item in parsed.items
            if item.raw_name.startswith("LAIT UHT")
        )
        self.assertEqual(milk.quantity, 4)
        self.assertEqual(milk.unit_price, 1.19)
        self.assertEqual(milk.total_price, 4.76)

        shrimp = next(
            item
            for item in parsed.items
            if "VANNAMEI" in item.raw_name
        )
        self.assertEqual(shrimp.quantity, 2)
        self.assertEqual(shrimp.unit_price, 2.55)
        self.assertEqual(shrimp.total_price, 5.1)

        names = " ".join(item.raw_name for item in parsed.items)
        self.assertNotIn("SOUS-TOTAL", names)
        self.assertNotIn("ELIGIBLES TR", names)
        self.assertNotIn("ESPECES", names)


if __name__ == "__main__":
    unittest.main()
