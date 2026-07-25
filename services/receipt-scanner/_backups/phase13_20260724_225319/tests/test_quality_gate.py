import unittest

from helpers import (
    TempImageTestCase,
    make_bad_image,
    make_document,
    make_good_image,
    make_token,
    parsed_receipt,
    standard_item,
)
from receipt_scanner.quality_gate import ReceiptQualityGate
from receipt_scanner.receipt_parser_fr import ParsedReceiptItem


def high_confidence_document(token_count: int = 40):
    return make_document(
        [
            make_token(index, f"TOKEN{index}", 70 + (index % 4) * 120, 80 + (index // 4) * 38, score=0.98)
            for index in range(token_count)
        ]
    )


def case_a_items():
    prices = [
        1.90, 3.12, 1.29, 1.94, 1.53, 1.90, 1.79, 1.92, 2.51, 2.25,
        1.75, 2.73, 2.27, 2.33, 2.99, 1.16, 3.99, 2.90, 4.41, 3.90,
    ]
    items = [standard_item(f"PRODUIT {index}", price) for index, price in enumerate(prices, start=1)]
    items[1].quantity = 2
    items[1].unit_price = 1.56
    items[1].item_type = "multibuy"
    items[2].item_type = "weight"
    items[2].unit_price = None
    items[2].weight_kg = 0.648
    items[2].price_per_kg = 1.99
    return items


def long_receipt_partial_items():
    items = [standard_item(f"LONG PRODUIT {index}", 2.00) for index in range(31)]
    items.append(
        ParsedReceiptItem(
            raw_name="MULTIBUY LONG",
            quantity=2,
            unit_price=6.02,
            total_price=12.04,
            vat_code=2,
            item_type="multibuy",
            raw_detail="2 X 6.02€",
            weight_kg=None,
            price_per_kg=None,
            ocr_confidence=0.98,
            source_line_ids=[],
            needs_review=False,
        )
    )
    return items


class QualityGateTest(TempImageTestCase):
    def evaluate(self, receipt, document=None, image_name="good.jpg"):
        image_path = self.temp_path / image_name
        make_good_image(image_path)
        return ReceiptQualityGate().evaluate(
            image_path,
            document or high_confidence_document(),
            receipt,
        )

    def test_case_a_trusted_short_receipt_decision(self) -> None:
        receipt = parsed_receipt(total=48.58, items=case_a_items(), declared_item_count=21)
        decision = self.evaluate(receipt)
        self.assertEqual(decision.status, "trusted")
        self.assertTrue(decision.should_record_budget)
        self.assertEqual(decision.budget_amount, 48.58)
        self.assertEqual(decision.article_data_mode, "full")
        self.assertTrue(decision.should_feed_courses)
        self.assertFalse(decision.should_feed_market_database)
        self.assertFalse(decision.requires_user_validation)
        self.assertEqual(decision.unattributed_amount, None)
        self.assertEqual(decision.receipt.product_line_count, 20)
        self.assertEqual(decision.receipt.counted_quantity, 21)
        self.assertEqual(decision.receipt.declared_item_count, 21)
        self.assertEqual(decision.receipt.items_total, 48.58)
        self.assertEqual(decision.receipt.total, 48.58)

    def test_case_b_horizontal_preprocessed_result_can_still_be_trusted(self) -> None:
        items = [standard_item(f"HORIZONTAL {index}", 2.80) for index in range(30)]
        items.append(standard_item("HORIZONTAL MULTIBUY", 5.81, quantity=2))
        receipt = parsed_receipt(total=89.81, items=items, declared_item_count=32)
        decision = self.evaluate(receipt)
        self.assertEqual(decision.status, "trusted")
        self.assertEqual(decision.receipt.product_line_count, 31)
        self.assertEqual(decision.receipt.counted_quantity, 32)
        self.assertEqual(decision.receipt.declared_item_count, 32)
        self.assertEqual(decision.receipt.items_total, 89.81)
        self.assertEqual(decision.receipt.total, 89.81)

    def test_case_c_unusable_image_with_no_ocr_tokens_is_rejected_without_crash(self) -> None:
        image_path = self.temp_path / "bad.jpg"
        make_bad_image(image_path)
        receipt = parsed_receipt(total=None, items=[], declared_item_count=None)
        decision = ReceiptQualityGate().evaluate(image_path, make_document([]), receipt)
        self.assertEqual(decision.status, "scan_not_exploitable")
        self.assertFalse(decision.exploitable)
        self.assertFalse(decision.should_record_budget)
        self.assertFalse(decision.should_feed_courses)
        self.assertFalse(decision.should_feed_market_database)
        self.assertFalse(decision.requires_user_validation)
        self.assertIn("image_severely_dark", decision.reasons)
        self.assertIn("ocr_too_few_tokens", decision.reasons)
        self.assertIn("no_receipt_structure_detected", decision.reasons)

    def test_case_d_incomplete_receipt_without_proven_total_needs_review(self) -> None:
        receipt = parsed_receipt(total=None, items=[standard_item("RIZ", 4.00)], declared_item_count=None)
        decision = self.evaluate(receipt)
        self.assertEqual(decision.status, "needs_review")
        self.assertFalse(decision.should_record_budget)
        self.assertIsNone(decision.budget_amount)
        self.assertFalse(decision.should_feed_courses)
        self.assertFalse(decision.should_feed_market_database)
        self.assertTrue(decision.requires_user_validation)
        self.assertIn("final_total_not_proven", decision.reasons)
        self.assertIn("declared_item_count_missing", decision.reasons)

    def test_case_e_long_receipt_partial_uses_paid_total_and_unattributed_gap(self) -> None:
        receipt = parsed_receipt(
            total=73.99,
            items=long_receipt_partial_items(),
            declared_item_count=33,
            warnings=["Description sans ligne secondaire: > FRUTS ET LEGUMES"],
            article_total=74.24,
            immediate_discount_total=0.25,
            payable_total=73.99,
        )
        decision = self.evaluate(receipt)
        self.assertEqual(decision.status, "budget_ok_articles_partial")
        self.assertTrue(decision.exploitable)
        self.assertTrue(decision.should_record_budget)
        self.assertEqual(decision.budget_amount, 73.99)
        self.assertEqual(decision.article_data_mode, "partial")
        self.assertFalse(decision.should_feed_courses)
        self.assertFalse(decision.should_feed_market_database)
        self.assertTrue(decision.should_feed_verified_articles)
        self.assertTrue(decision.requires_user_validation)
        self.assertEqual(decision.unattributed_amount, 0.20)
        self.assertEqual(decision.receipt.product_line_count, 32)
        self.assertEqual(decision.receipt.counted_quantity, 33)
        self.assertEqual(decision.receipt.declared_item_count, 33)
        self.assertEqual(decision.receipt.items_total, 74.04)
        self.assertEqual(decision.receipt.total, 73.99)
        self.assertEqual(decision.receipt.article_total, 74.24)
        self.assertEqual(decision.receipt.article_reconciliation_total, 74.24)
        self.assertIn("items_sum_differs_from_total", decision.reasons)
        self.assertNotIn("parser_warnings_present", decision.reasons)

    def test_regression_does_not_force_7404_items_total_to_7424(self) -> None:
        receipt = parsed_receipt(
            total=73.99,
            items=long_receipt_partial_items(),
            declared_item_count=33,
            article_total=74.24,
            immediate_discount_total=0.25,
            payable_total=73.99,
        )
        decision = self.evaluate(receipt)
        self.assertEqual(decision.receipt.items_total, 74.04)
        self.assertNotEqual(decision.receipt.items_total, decision.receipt.article_total)
        self.assertEqual(decision.budget_amount, 73.99)
        self.assertEqual(decision.unattributed_amount, 0.20)


if __name__ == "__main__":
    unittest.main()
