from __future__ import annotations

from dataclasses import asdict, dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Any


class LineRole(str, Enum):
    HEADER = "header"
    SECTION = "section"
    PRODUCT = "product"
    DETAIL = "detail"
    TOTAL = "total"
    SUBTOTAL = "subtotal"
    TAX = "tax"
    PAYMENT = "payment"
    CHANGE = "change"
    COUNT = "count"
    DISCOUNT = "discount"
    FOOTER = "footer"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class MoneyEvidence:
    amount: Decimal
    token_index: int
    x_center: float
    score: float
    raw_text: str

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["amount"] = float(self.amount)
        return payload


@dataclass(slots=True)
class LineEvidence:
    line_id: int
    text: str
    normalized_text: str
    center_y: float
    y_min: float
    y_max: float
    confidence: float
    source_segment: str | None
    money: list[MoneyEvidence] = field(default_factory=list)
    role_scores: dict[str, float] = field(default_factory=dict)
    has_letters: bool = False
    has_digits: bool = False
    has_multibuy: bool = False
    has_weight: bool = False
    declared_count: int | None = None

    def score_for(self, role: LineRole) -> float:
        return float(self.role_scores.get(role.value, 0.0))

    @property
    def strongest_role(self) -> str:
        if not self.role_scores:
            return LineRole.UNKNOWN.value
        return max(self.role_scores.items(), key=lambda item: item[1])[0]

    @property
    def rightmost_money(self) -> MoneyEvidence | None:
        return max(self.money, key=lambda item: item.x_center) if self.money else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "line_id": self.line_id,
            "text": self.text,
            "normalized_text": self.normalized_text,
            "center_y": self.center_y,
            "y_min": self.y_min,
            "y_max": self.y_max,
            "confidence": self.confidence,
            "source_segment": self.source_segment,
            "money": [item.to_dict() for item in self.money],
            "role_scores": dict(self.role_scores),
            "strongest_role": self.strongest_role,
            "has_letters": self.has_letters,
            "has_digits": self.has_digits,
            "has_multibuy": self.has_multibuy,
            "has_weight": self.has_weight,
            "declared_count": self.declared_count,
        }


@dataclass(slots=True)
class ItemCandidate:
    candidate_id: str
    start_line: int
    end_line: int
    source_line_ids: tuple[int, ...]
    raw_name: str
    normalized_name: str
    quantity: Decimal
    unit_price: Decimal | None
    total_price: Decimal
    item_type: str
    confidence: float
    local_score: float
    evidence: list[str] = field(default_factory=list)
    arithmetic_ok: bool | None = None

    @property
    def counted_quantity(self) -> int:
        if self.quantity <= 0:
            return 1
        integral = self.quantity.to_integral_value()
        if abs(self.quantity - integral) <= Decimal("0.001"):
            return max(1, int(integral))
        return 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "source_line_ids": list(self.source_line_ids),
            "raw_name": self.raw_name,
            "normalized_name": self.normalized_name,
            "quantity": float(self.quantity),
            "unit_price": float(self.unit_price) if self.unit_price is not None else None,
            "total_price": float(self.total_price),
            "item_type": self.item_type,
            "confidence": self.confidence,
            "local_score": self.local_score,
            "evidence": list(self.evidence),
            "arithmetic_ok": self.arithmetic_ok,
            "counted_quantity": self.counted_quantity,
        }


@dataclass(slots=True)
class TotalCandidate:
    line_ids: tuple[int, ...]
    amount: Decimal
    kind: str
    confidence: float
    score: float
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "line_ids": list(self.line_ids),
            "amount": float(self.amount),
            "kind": self.kind,
            "confidence": self.confidence,
            "score": self.score,
            "evidence": list(self.evidence),
        }


@dataclass(slots=True)
class ReceiptHypothesis:
    items: list[ItemCandidate]
    target_total: TotalCandidate | None
    declared_count: int | None
    items_total: Decimal
    counted_quantity: int
    score: float
    total_gap: Decimal | None
    count_gap: int | None
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "items": [item.to_dict() for item in self.items],
            "target_total": (
                self.target_total.to_dict()
                if self.target_total is not None
                else None
            ),
            "declared_count": self.declared_count,
            "items_total": float(self.items_total),
            "counted_quantity": self.counted_quantity,
            "score": self.score,
            "total_gap": (
                float(self.total_gap)
                if self.total_gap is not None
                else None
            ),
            "count_gap": self.count_gap,
            "reasons": list(self.reasons),
        }
