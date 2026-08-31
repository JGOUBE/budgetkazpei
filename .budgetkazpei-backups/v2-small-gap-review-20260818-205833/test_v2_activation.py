from __future__ import annotations

import unittest

from receipt_scanner.receipt_parser_fr import ParsedReceipt
from receipt_scanner.v2.activation import build_v2_safe_candidate


def legacy_receipt(
    *,
    total: float | None = 10.0,
    payable_total: float | None = None,
) -> ParsedReceipt:
    return ParsedReceipt(
        store_name="E.Leclerc",
        store_location="CASERNES",
        receipt_date="2026-07-24",
        receipt_time="10:15",
        declared_item_count=None,
        total=total,
        items=[],
        excluded_sections=[],
        warnings=[],
        article_total=total,
        payable_total=payable_total,
    )


def v2_result(
    *,
    target: float | None = 10.0,
    kind: str = "article_total",
    items_total: float = 10.0,
    declared_count: int | None = None,
    counted_quantity: int = 2,
) -> dict[str, object]:
    target_payload = None
    if target is not None:
        target_payload = {
            "amount": target,
            "kind": kind,
            "confidence": 0.98,
            "score": 7.5,
        }
    return {
        "selected_hypothesis": {
            "items": [
                {
                    "raw_name": "ARTICLE A",
                    "normalized_name": "ARTICLE A",
                    "quantity": 1,
                    "unit_price": 4.0,
                    "total_price": 4.0,
                    "item_type": "standard",
                    "confidence": 0.96,
                    "local_score": 5.7,
                    "source_line_ids": [1],
                    "arithmetic_ok": True,
                },
                {
                    "raw_name": "ARTICLE B",
                    "normalized_name": "ARTICLE B",
                    "quantity": 1,
                    "unit_price": items_total - 4.0,
                    "total_price": items_total - 4.0,
                    "item_type": "standard",
                    "confidence": 0.94,
                    "local_score": 5.6,
                    "source_line_ids": [2],
                    "arithmetic_ok": True,
                },
            ],
            "target_total": target_payload,
            "declared_count": declared_count,
            "items_total": items_total,
            "counted_quantity": counted_quantity,
            "score": 80.0,
            "reasons": ["exact_total_match"],
        }
    }


class V2ActivationTest(unittest.TestCase):
    def test_accepts_exact_article_total(self) -> None:
        candidate = build_v2_safe_candidate(
            legacy_receipt=legacy_receipt(total=None),
            v2_result=v2_result(),
        )
        self.assertTrue(candidate.accepted)
        assert candidate.receipt is not None
        self.assertEqual(candidate.receipt.total, 10.0)
        self.assertEqual(candidate.receipt.article_total, 10.0)
        self.assertIsNone(candidate.receipt.payable_total)
        self.assertEqual(len(candidate.receipt.items), 2)

    def test_accepts_payable_total_with_bounded_discount_and_exact_count(self) -> None:
        candidate = build_v2_safe_candidate(
            legacy_receipt=legacy_receipt(total=9.0, payable_total=9.0),
            v2_result=v2_result(
                target=9.0,
                kind="payable",
                items_total=10.0,
                declared_count=2,
                counted_quantity=2,
            ),
        )
        self.assertTrue(candidate.accepted)
        assert candidate.receipt is not None
        self.assertEqual(candidate.receipt.total, 9.0)
        self.assertEqual(candidate.receipt.article_total, 10.0)
        self.assertEqual(candidate.receipt.payable_total, 9.0)
        self.assertEqual(candidate.receipt.immediate_discount_total, 1.0)

    def test_rejects_missing_target(self) -> None:
        candidate = build_v2_safe_candidate(
            legacy_receipt=legacy_receipt(),
            v2_result=v2_result(target=None),
        )
        self.assertFalse(candidate.accepted)
        self.assertIn("v2_missing_positive_total", candidate.fallback_reasons)

    def test_rejects_declared_count_mismatch(self) -> None:
        candidate = build_v2_safe_candidate(
            legacy_receipt=legacy_receipt(),
            v2_result=v2_result(declared_count=3, counted_quantity=2),
        )
        self.assertFalse(candidate.accepted)
        self.assertIn("v2_declared_count_mismatch", candidate.fallback_reasons)

    def test_rejects_article_total_when_legacy_proves_lower_payable(self) -> None:
        candidate = build_v2_safe_candidate(
            legacy_receipt=legacy_receipt(total=9.0, payable_total=9.0),
            v2_result=v2_result(target=10.0, kind="article_total"),
        )
        self.assertFalse(candidate.accepted)
        self.assertIn(
            "legacy_has_different_payable_total",
            candidate.fallback_reasons,
        )


if __name__ == "__main__":
    unittest.main()
