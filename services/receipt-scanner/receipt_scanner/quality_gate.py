from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import mean, median
from typing import Any, Literal

import cv2
import numpy as np

from .geometry_types import OCRDocument
from .receipt_parser_fr import ParsedReceipt


QualityStatus = Literal[
    "trusted",
    "budget_ok_articles_partial",
    "needs_review",
    "scan_not_exploitable",
]

ArticleDataMode = Literal["full", "partial", "blocked", "none"]


@dataclass(slots=True)
class ImageQualityMetrics:
    width: int
    height: int
    brightness_mean: float
    contrast_std: float
    blur_variance: float
    dark_pixel_ratio: float
    bright_pixel_ratio: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class OCRQualityMetrics:
    token_count: int
    average_confidence: float
    median_confidence: float
    low_confidence_ratio: float
    very_low_confidence_ratio: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ReceiptQualityMetrics:
    product_line_count: int
    counted_quantity: float
    declared_item_count: int | None
    items_total: float
    total: float | None
    article_total: float | None
    immediate_discount_total: float | None
    payable_total: float | None
    article_reconciliation_total: float | None
    total_delta: float | None
    quantity_delta: float | None
    warning_count: int
    significant_warning_count: int
    ignored_warning_count: int
    reliable_item_count: int
    review_item_count: int
    reliable_items_total: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class QualityDecision:
    status: QualityStatus
    exploitable: bool

    # Budget decision.
    should_record_budget: bool
    budget_amount: float | None

    # Article-level decision.
    article_data_mode: ArticleDataMode
    should_feed_courses: bool
    should_feed_market_database: bool
    should_feed_verified_articles: bool

    requires_user_validation: bool
    reasons: list[str]
    unattributed_amount: float | None

    image: ImageQualityMetrics
    ocr: OCRQualityMetrics
    receipt: ReceiptQualityMetrics

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "exploitable": self.exploitable,
            "should_record_budget": self.should_record_budget,
            "budget_amount": self.budget_amount,
            "article_data_mode": self.article_data_mode,
            "should_feed_courses": self.should_feed_courses,
            "should_feed_market_database": self.should_feed_market_database,
            "should_feed_verified_articles": self.should_feed_verified_articles,
            "requires_user_validation": self.requires_user_validation,
            "reasons": self.reasons,
            "unattributed_amount": self.unattributed_amount,
            "image": self.image.to_dict(),
            "ocr": self.ocr.to_dict(),
            "receipt": self.receipt.to_dict(),
        }

    def save_json(self, path: str | Path) -> None:
        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


class ReceiptQualityGate:
    """
    Conservative quality gate for receipt scans.

    Business statuses:
    - trusted:
      total and article details are internally coherent;
    - budget_ok_articles_partial:
      the final ticket total is sufficiently proven for the budget, but the
      article detail is incomplete or not fully reconciled;
    - needs_review:
      the scan is readable, but the final total itself is not sufficiently
      proven for automatic budget recording;
    - scan_not_exploitable:
      too little reliable evidence; request another photo or manual entry.

    Important rule:
    the gate never changes an article price merely to force equality with the
    final total. An unexplained difference is stored as unattributed_amount.
    """

    def __init__(
        self,
        *,
        min_width: int = 350,
        min_height: int = 600,
        low_confidence_threshold: float = 0.75,
        very_low_confidence_threshold: float = 0.50,
    ) -> None:
        self.min_width = min_width
        self.min_height = min_height
        self.low_confidence_threshold = low_confidence_threshold
        self.very_low_confidence_threshold = very_low_confidence_threshold

    @staticmethod
    def _read_image_metrics(image_path: str | Path) -> ImageQualityMetrics:
        path = Path(image_path)
        image = cv2.imread(str(path))

        if image is None:
            raise FileNotFoundError(f"Unable to read image: {path}")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        height, width = gray.shape[:2]

        return ImageQualityMetrics(
            width=int(width),
            height=int(height),
            brightness_mean=round(float(gray.mean()), 3),
            contrast_std=round(float(gray.std()), 3),
            blur_variance=round(
                float(cv2.Laplacian(gray, cv2.CV_64F).var()),
                3,
            ),
            dark_pixel_ratio=round(float(np.mean(gray < 40)), 5),
            bright_pixel_ratio=round(float(np.mean(gray > 245)), 5),
        )

    def _read_ocr_metrics(self, document: OCRDocument) -> OCRQualityMetrics:
        scores = [float(token.score) for token in document.tokens]

        if not scores:
            return OCRQualityMetrics(
                token_count=0,
                average_confidence=0.0,
                median_confidence=0.0,
                low_confidence_ratio=1.0,
                very_low_confidence_ratio=1.0,
            )

        return OCRQualityMetrics(
            token_count=len(scores),
            average_confidence=round(float(mean(scores)), 4),
            median_confidence=round(float(median(scores)), 4),
            low_confidence_ratio=round(
                sum(score < self.low_confidence_threshold for score in scores)
                / len(scores),
                4,
            ),
            very_low_confidence_ratio=round(
                sum(
                    score < self.very_low_confidence_threshold
                    for score in scores
                )
                / len(scores),
                4,
            ),
        )

    @staticmethod
    def _is_ignorable_parser_warning(warning: str) -> bool:
        """Ignore only obvious section-header warnings."""
        if ":" not in warning:
            return False

        prefix, payload = warning.split(":", 1)
        payload = payload.strip()

        supported_prefixes = {
            "Description sans ligne secondaire",
            "Description remplacée sans prix",
        }

        return prefix.strip() in supported_prefixes and payload.startswith(">")

    @classmethod
    def _read_receipt_metrics(
        cls,
        receipt: ParsedReceipt,
    ) -> ReceiptQualityMetrics:
        reconciliation_total = receipt.article_reconciliation_total
        total_delta = (
            round(abs(receipt.items_total - reconciliation_total), 2)
            if reconciliation_total is not None
            else None
        )
        quantity_delta = (
            round(
                abs(
                    receipt.counted_quantity
                    - float(receipt.declared_item_count)
                ),
                3,
            )
            if receipt.declared_item_count is not None
            else None
        )

        ignored_warning_count = sum(
            cls._is_ignorable_parser_warning(warning)
            for warning in receipt.warnings
        )
        significant_warning_count = len(receipt.warnings) - ignored_warning_count

        reliable_items = [
            item
            for item in receipt.items
            if not bool(getattr(item, "needs_review", False))
        ]
        review_item_count = len(receipt.items) - len(reliable_items)
        reliable_items_total = round(
            sum(float(item.total_price) for item in reliable_items),
            2,
        )

        return ReceiptQualityMetrics(
            product_line_count=len(receipt.items),
            counted_quantity=receipt.counted_quantity,
            declared_item_count=receipt.declared_item_count,
            items_total=receipt.items_total,
            total=receipt.total,
            article_total=receipt.article_total,
            immediate_discount_total=receipt.immediate_discount_total,
            payable_total=receipt.payable_total,
            article_reconciliation_total=reconciliation_total,
            total_delta=total_delta,
            quantity_delta=quantity_delta,
            warning_count=len(receipt.warnings),
            significant_warning_count=significant_warning_count,
            ignored_warning_count=ignored_warning_count,
            reliable_item_count=len(reliable_items),
            review_item_count=review_item_count,
            reliable_items_total=reliable_items_total,
        )

    @staticmethod
    def _append_once(target: list[str], reason: str) -> None:
        if reason not in target:
            target.append(reason)

    def evaluate(
        self,
        image_path: str | Path,
        document: OCRDocument,
        receipt: ParsedReceipt,
    ) -> QualityDecision:
        image = self._read_image_metrics(image_path)
        ocr = self._read_ocr_metrics(document)
        parsed = self._read_receipt_metrics(receipt)

        hard_fail_reasons: list[str] = []
        budget_blocking_reasons: list[str] = []
        article_partial_reasons: list[str] = []

        # Hard failures: insufficient physical or OCR evidence.
        # A narrow but very tall receipt can still be fully exploitable when
        # OCR evidence is exceptionally strong. This protects genuine
        # high-resolution ticket screenshots (for example 304 x 1600 px)
        # without accepting weak thumbnails.
        narrow_but_strong = (
            min(image.width, image.height) >= 280
            and max(image.width, image.height) >= self.min_height
            and ocr.token_count >= 60
            and ocr.average_confidence >= 0.90
            and ocr.low_confidence_ratio <= 0.10
            and parsed.total is not None
        )
        if (
            min(image.width, image.height) < self.min_width
            and not narrow_but_strong
        ):
            hard_fail_reasons.append("image_too_narrow")
        if max(image.width, image.height) < self.min_height:
            hard_fail_reasons.append("image_too_small")
        if image.brightness_mean < 30:
            hard_fail_reasons.append("image_severely_dark")
        if image.brightness_mean > 248:
            hard_fail_reasons.append("image_severely_overexposed")
        if ocr.token_count < 8:
            hard_fail_reasons.append("ocr_too_few_tokens")
        if ocr.average_confidence < 0.35 and ocr.token_count < 20:
            hard_fail_reasons.append("ocr_confidence_too_low")
        if image.blur_variance < 8 and ocr.token_count < 20:
            hard_fail_reasons.append("image_severely_blurred")
        if parsed.product_line_count == 0 and parsed.total is None:
            if ocr.token_count < 20 or ocr.average_confidence < 0.60:
                hard_fail_reasons.append("no_receipt_structure_detected")
            else:
                budget_blocking_reasons.append("receipt_structure_not_recognized")

        if hard_fail_reasons:
            return QualityDecision(
                status="scan_not_exploitable",
                exploitable=False,
                should_record_budget=False,
                budget_amount=None,
                article_data_mode="none",
                should_feed_courses=False,
                should_feed_market_database=False,
                should_feed_verified_articles=False,
                requires_user_validation=False,
                reasons=hard_fail_reasons,
                unattributed_amount=None,
                image=image,
                ocr=ocr,
                receipt=parsed,
            )

        # A final total is mandatory for automatic budget recording.
        if parsed.total is None:
            budget_blocking_reasons.append("final_total_not_proven")

        # Broad quality concerns make the final amount unsafe for automatic
        # recording, even when the parser found a total-like value.
        if ocr.average_confidence < 0.82:
            budget_blocking_reasons.append("average_ocr_confidence_low")
        if ocr.low_confidence_ratio > 0.25:
            budget_blocking_reasons.append("too_many_low_confidence_tokens")
        if ocr.very_low_confidence_ratio > 0.10:
            budget_blocking_reasons.append(
                "too_many_very_low_confidence_tokens"
            )
        if image.blur_variance < 25:
            budget_blocking_reasons.append("image_may_be_blurred")
        if image.contrast_std < 15:
            budget_blocking_reasons.append("image_contrast_too_low")
        if image.brightness_mean < 55:
            budget_blocking_reasons.append("image_too_dark")
        if (
            image.brightness_mean > 238
            and image.contrast_std < 35
        ):
            budget_blocking_reasons.append("image_too_bright")

        # Article-detail issues. They do not invalidate a clearly proven final
        # ticket total, but they block automatic article exploitation.
        if parsed.product_line_count == 0:
            article_partial_reasons.append("no_product_extracted")
        if parsed.declared_item_count is None:
            article_partial_reasons.append("declared_item_count_missing")
        if parsed.total_delta is not None and parsed.total_delta > 0.02:
            article_partial_reasons.append("items_sum_differs_from_total")
        if parsed.quantity_delta is not None and parsed.quantity_delta > 0.001:
            article_partial_reasons.append(
                "reconstructed_quantity_differs_from_declared"
            )
        if parsed.review_item_count > 0:
            article_partial_reasons.append("items_marked_for_review")
        if parsed.significant_warning_count > 0:
            article_partial_reasons.append("parser_warnings_present")

        if budget_blocking_reasons:
            combined_reasons = list(budget_blocking_reasons)
            for reason in article_partial_reasons:
                self._append_once(combined_reasons, reason)

            return QualityDecision(
                status="needs_review",
                exploitable=True,
                should_record_budget=False,
                budget_amount=None,
                article_data_mode=(
                    "partial" if parsed.product_line_count > 0 else "none"
                ),
                should_feed_courses=False,
                should_feed_market_database=False,
                should_feed_verified_articles=False,
                requires_user_validation=True,
                reasons=combined_reasons,
                unattributed_amount=parsed.total_delta,
                image=image,
                ocr=ocr,
                receipt=parsed,
            )

        if article_partial_reasons:
            # A global accounting difference must not invalidate every
            # individually reliable article. The downstream layer remains
            # responsible for keeping only line-level trusted items and
            # excluding items explicitly marked for review.
            should_feed_verified_articles = (
                parsed.reliable_item_count > 0
            )

            return QualityDecision(
                status="budget_ok_articles_partial",
                exploitable=True,
                should_record_budget=True,
                budget_amount=parsed.total,
                article_data_mode=(
                    "partial" if parsed.product_line_count > 0 else "none"
                ),
                should_feed_courses=False,
                should_feed_market_database=False,
                should_feed_verified_articles=should_feed_verified_articles,
                requires_user_validation=True,
                reasons=article_partial_reasons,
                unattributed_amount=(
                    parsed.total_delta
                    if parsed.total_delta is not None and parsed.total_delta > 0
                    else None
                ),
                image=image,
                ocr=ocr,
                receipt=parsed,
            )

        return QualityDecision(
            status="trusted",
            exploitable=True,
            should_record_budget=True,
            budget_amount=parsed.total,
            article_data_mode="full",
            should_feed_courses=True,
            should_feed_market_database=False,
            should_feed_verified_articles=True,
            requires_user_validation=False,
            reasons=[],
            unattributed_amount=(
                parsed.total_delta
                if parsed.total_delta is not None and parsed.total_delta > 0
                else None
            ),
            image=image,
            ocr=ocr,
            receipt=parsed,
        )


def _load_parsed_receipt(path: str | Path) -> ParsedReceipt:
    from .receipt_parser_fr import ParsedReceiptItem

    data = json.loads(Path(path).read_text(encoding="utf-8"))

    items = [
        ParsedReceiptItem(
            raw_name=str(item["raw_name"]),
            quantity=float(item.get("quantity", 1.0)),
            unit_price=(
                float(item["unit_price"])
                if item.get("unit_price") is not None
                else None
            ),
            total_price=float(item["total_price"]),
            vat_code=(
                int(item["vat_code"])
                if item.get("vat_code") is not None
                else None
            ),
            item_type=str(item.get("item_type", "standard")),
            raw_detail=item.get("raw_detail"),
            weight_kg=(
                float(item["weight_kg"])
                if item.get("weight_kg") is not None
                else None
            ),
            price_per_kg=(
                float(item["price_per_kg"])
                if item.get("price_per_kg") is not None
                else None
            ),
            ocr_confidence=float(item.get("ocr_confidence", 0.0)),
            source_line_ids=[
                int(value) for value in item.get("source_line_ids", [])
            ],
            needs_review=bool(item.get("needs_review", False)),
            canonical_name=item.get("canonical_name"),
            match_type=item.get("match_type"),
            match_confidence=(
                float(item["match_confidence"])
                if item.get("match_confidence") is not None
                else None
            ),
        )
        for item in data.get("items", [])
    ]

    return ParsedReceipt(
        store_name=data.get("store_name"),
        store_location=data.get("store_location"),
        receipt_date=data.get("receipt_date"),
        receipt_time=data.get("receipt_time"),
        declared_item_count=data.get("declared_item_count"),
        total=data.get("total"),
        items=items,
        excluded_sections=list(data.get("excluded_sections", [])),
        warnings=list(data.get("warnings", [])),
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Evaluate whether a receipt scan is exploitable."
    )
    parser.add_argument("image", help="Preprocessed receipt image")
    parser.add_argument("ocr_json", help="Normalized OCR JSON")
    parser.add_argument("parsed_json", help="Parsed receipt JSON")
    parser.add_argument("output", help="Output quality decision JSON")
    return parser


def main() -> int:
    args = _build_parser().parse_args()

    document = OCRDocument.load_json(args.ocr_json)
    receipt = _load_parsed_receipt(args.parsed_json)

    decision = ReceiptQualityGate().evaluate(
        args.image,
        document,
        receipt,
    )
    decision.save_json(args.output)

    print(json.dumps(decision.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
