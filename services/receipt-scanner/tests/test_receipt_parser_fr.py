import unittest

from helpers import make_document, make_line
from receipt_scanner.receipt_parser_fr import ReceiptParserFR


def coherent_short_receipt_lines():
    lines = [
        make_line(0, [("E.LECLERC", "description", 70)], y=40),
        make_line(1, [("LE PORTAIL", "description", 70)], y=80),
        make_line(2, [("17/07/2026", "description", 70), ("14:13", "description", 210)], y=120),
        make_line(3, [("DESIGNATION", "description", 70), ("TTC", "price", 620), ("TVA", "vat", 730)], y=180),
        make_line(4, [(">> EPICERIE", "description", 70)], y=230),
        make_line(5, [("CORNICHONS 72 CL,360G", "description", 70), ("1.90", "price", 620), ("1", "vat", 730)], y=280),
        make_line(6, [("TORTILLAS NATURE TOKAPI 150G", "description", 70)], y=330),
        make_line(7, [("2 X 1.56â‚¬", "detail", 70), ("3.12", "price", 620), ("2", "vat", 730)], y=370),
        make_line(8, [(">> FRUITS ET LEGUMES", "description", 70)], y=430),
        make_line(9, [("POMME GRANNY SMITH", "description", 70)], y=480),
        make_line(10, [("0.648 kg X 1.99 /kg", "detail", 70), ("1.29", "price", 620), ("2", "vat", 730)], y=520),
        make_line(11, [(">> CREMERIE", "description", 70)], y=580),
    ]
    prices = [
        1.94, 1.53, 1.90, 1.79, 1.92, 2.51, 2.25, 1.75, 2.73,
        2.27, 2.33, 2.99, 1.16, 3.99, 2.90, 4.41, 3.90,
    ]
    y = 630
    for index, price in enumerate(prices, start=12):
        lines.append(
            make_line(
                index,
                [(f"PRODUIT TEST {index}", "description", 70), (f"{price:.2f}", "price", 620), ("2", "vat", 730)],
                y=y,
            )
        )
        y += 42
    lines.append(make_line(40, [("TOTAL 21 ARTICLES", "description", 70), ("48.58", "price", 620)], y=y + 30))
    return lines


class ReceiptParserFRTest(unittest.TestCase):
    def test_short_receipt_case_a_is_parsed_without_private_photo(self) -> None:
        lines = coherent_short_receipt_lines()
        parsed = ReceiptParserFR().parse(make_document([]), lines)
        self.assertEqual(parsed.store_name, "E.Leclerc")
        self.assertEqual(parsed.store_location, "LE PORTAIL")
        self.assertEqual(parsed.declared_item_count, 21)
        self.assertEqual(parsed.total, 48.58)
        self.assertEqual(len(parsed.items), 20)
        self.assertEqual(parsed.counted_quantity, 21)
        self.assertEqual(parsed.items_total, 48.58)
        self.assertEqual(parsed.excluded_sections, ["EPICERIE", "FRUITS ET LEGUMES", "CREMERIE"])

    def test_multibuy_line_preserves_quantity_unit_and_total(self) -> None:
        parsed = ReceiptParserFR().parse(make_document([]), coherent_short_receipt_lines())
        item = next(item for item in parsed.items if item.item_type == "multibuy")
        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.unit_price, 1.56)
        self.assertEqual(item.total_price, 3.12)

    def test_weight_item_preserves_weight_price_per_kg_and_total(self) -> None:
        parsed = ReceiptParserFR().parse(make_document([]), coherent_short_receipt_lines())
        item = next(item for item in parsed.items if item.item_type == "weight")
        self.assertEqual(item.weight_kg, 0.648)
        self.assertEqual(item.price_per_kg, 1.99)
        self.assertEqual(item.total_price, 1.29)

    def test_section_header_does_not_become_an_item(self) -> None:
        parsed = ReceiptParserFR().parse(make_document([]), coherent_short_receipt_lines())
        names = [item.raw_name for item in parsed.items]
        self.assertNotIn("EPICERIE", names)
        self.assertNotIn("FRUITS ET LEGUMES", names)


if __name__ == "__main__":
    unittest.main()
