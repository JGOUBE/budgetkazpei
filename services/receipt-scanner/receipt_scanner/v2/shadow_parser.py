from __future__ import annotations

from typing import Any

from ..geometry_types import OCRDocument
from ..line_reconstructor import ReconstructedLine
from .candidate_builder import (
    GenericCandidateBuilder,
    GenericTotalCandidateBuilder,
)
from .line_classifier import GenericLineClassifier
from .models import LineRole
from .solver import GlobalReceiptSolver


class GenericReceiptParserV2:
    """Shadow-only generic receipt interpretation.

    It does not replace ReceiptParserFR in phase 1. Its output is intended for
    corpus diagnostics and objective comparison.
    """

    def __init__(self) -> None:
        self.classifier = GenericLineClassifier()
        self.candidate_builder = GenericCandidateBuilder()
        self.total_builder = GenericTotalCandidateBuilder()
        self.solver = GlobalReceiptSolver()

    def analyze(
        self,
        document: OCRDocument,
        lines: list[ReconstructedLine],
        *,
        legacy_receipt: Any | None = None,
    ) -> dict[str, Any]:
        evidence = self.classifier.classify(
            lines,
            image_width=document.image_width,
        )
        candidates = self.candidate_builder.build(
            lines,
            evidence,
            image_width=document.image_width,
        )
        totals = self.total_builder.build(evidence)
        declared_count = next(
            (
                line.declared_count
                for line in evidence
                if line.declared_count is not None
            ),
            None,
        )
        max_line_id = max((line.line_id for line in lines), default=0)
        hypothesis = self.solver.solve(
            candidates=candidates,
            total_candidates=totals,
            declared_count=declared_count,
            max_line_id=max_line_id,
        )

        legacy_payload = None
        if legacy_receipt is not None:
            legacy_payload = (
                legacy_receipt.to_dict()
                if hasattr(legacy_receipt, "to_dict")
                else legacy_receipt
            )

        return {
            "engine": "budgetkazpei-generic-parser-v2-shadow",
            "phase": 1,
            "production_output_changed": False,
            "declared_count": declared_count,
            "line_count": len(lines),
            "candidate_count": len(candidates),
            "total_candidate_count": len(totals),
            "selected_hypothesis": hypothesis.to_dict(),
            "total_candidates": [item.to_dict() for item in totals],
            "item_candidates": [item.to_dict() for item in candidates],
            "lines": [line.to_dict() for line in evidence],
            "legacy_receipt": legacy_payload,
            "comparison": self._comparison(
                hypothesis.to_dict(),
                legacy_payload,
            ),
        }

    @staticmethod
    def _comparison(
        v2: dict[str, Any],
        legacy: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if legacy is None:
            return None
        return {
            "legacy_total": legacy.get("total"),
            "legacy_article_total": legacy.get("article_total"),
            "legacy_items_total": legacy.get("items_total"),
            "legacy_product_line_count": legacy.get("product_line_count"),
            "legacy_counted_quantity": legacy.get("counted_quantity"),
            "v2_total": (
                v2.get("target_total", {}) or {}
            ).get("amount"),
            "v2_items_total": v2.get("items_total"),
            "v2_product_line_count": len(v2.get("items", [])),
            "v2_counted_quantity": v2.get("counted_quantity"),
            "v2_reasons": v2.get("reasons", []),
        }
