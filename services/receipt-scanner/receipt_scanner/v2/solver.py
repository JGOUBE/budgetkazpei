from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from .models import ItemCandidate, ReceiptHypothesis, TotalCandidate


@dataclass(slots=True)
class _State:
    score: float
    items: tuple[ItemCandidate, ...]


class GlobalReceiptSolver:
    """Selects a non-overlapping set of item hypotheses globally.

    The solver rewards local OCR/layout evidence, but exact arithmetic and the
    printed article count can outweigh a locally plausible yet duplicated row.
    """

    def __init__(
        self,
        *,
        beam_width: int = 1200,
    ) -> None:
        self.beam_width = max(100, beam_width)

    def solve(
        self,
        *,
        candidates: list[ItemCandidate],
        total_candidates: list[TotalCandidate],
        declared_count: int | None,
        max_line_id: int,
    ) -> ReceiptHypothesis:
        targets: list[TotalCandidate | None] = (
            list(total_candidates) if total_candidates else [None]
        )
        hypotheses = [
            self._solve_for_target(
                candidates=candidates,
                target=target,
                declared_count=declared_count,
                max_line_id=max_line_id,
            )
            for target in targets[:8]
        ]
        return max(hypotheses, key=lambda item: item.score)

    def _solve_for_target(
        self,
        *,
        candidates: list[ItemCandidate],
        target: TotalCandidate | None,
        declared_count: int | None,
        max_line_id: int,
    ) -> ReceiptHypothesis:
        by_start: dict[int, list[ItemCandidate]] = {}
        for candidate in candidates:
            by_start.setdefault(candidate.start_line, []).append(candidate)

        states: dict[int, dict[tuple[int, int], _State]] = {
            0: {(0, 0): _State(score=0.0, items=())}
        }

        for position in range(0, max_line_id + 2):
            current = states.get(position)
            if not current:
                continue

            carried = states.setdefault(position + 1, {})
            for key, state in current.items():
                existing = carried.get(key)
                if existing is None or state.score > existing.score:
                    carried[key] = state

            for candidate in by_start.get(position, []):
                destination = candidate.end_line + 1
                destination_states = states.setdefault(destination, {})

                for (sum_cents, count), state in current.items():
                    next_sum = sum_cents + int(
                        candidate.total_price * 100
                    )
                    next_count = count + candidate.counted_quantity
                    key = (next_sum, next_count)
                    next_state = _State(
                        score=state.score + candidate.local_score,
                        items=state.items + (candidate,),
                    )
                    existing = destination_states.get(key)
                    if existing is None or next_state.score > existing.score:
                        destination_states[key] = next_state

            self._prune(states.get(position + 1), target, declared_count)
            for candidate in by_start.get(position, []):
                self._prune(
                    states.get(candidate.end_line + 1),
                    target,
                    declared_count,
                )

        final_states: list[_State] = []
        for position, position_states in states.items():
            if position >= max_line_id + 1:
                final_states.extend(position_states.values())

        if not final_states:
            final_states = [_State(score=0.0, items=())]

        best_hypothesis: ReceiptHypothesis | None = None
        for state in final_states:
            items_total = sum(
                (item.total_price for item in state.items),
                Decimal("0"),
            ).quantize(Decimal("0.01"))
            counted = sum(item.counted_quantity for item in state.items)

            total_gap = (
                abs(items_total - target.amount)
                if target is not None
                else None
            )
            count_gap = (
                abs(counted - declared_count)
                if declared_count is not None
                else None
            )

            score = state.score
            reasons: list[str] = []

            is_payable_target = (
                target is not None and target.kind == "payable"
            )

            if target is not None:
                gap_cents = int(total_gap * 100)
                score += target.score
                if gap_cents == 0:
                    # A payable total may legitimately be lower than the sum
                    # of products because of discounts or loyalty advantages.
                    # Exact arithmetic therefore remains useful, but it must
                    # not outweigh an exact printed article count.
                    score += 20.0 if is_payable_target else 32.0
                    reasons.append("exact_total_match")
                else:
                    if is_payable_target:
                        score -= min(20.0, gap_cents * 0.03)
                    else:
                        score -= min(60.0, gap_cents * 0.18)
                    reasons.append(f"total_gap_cents={gap_cents}")

            if declared_count is not None:
                if count_gap == 0:
                    score += 40.0 if is_payable_target else 26.0
                    reasons.append("exact_declared_count_match")
                else:
                    if is_payable_target:
                        score -= min(90.0, count_gap * 12.0)
                    else:
                        score -= min(72.0, count_gap * 9.0)
                    reasons.append(f"count_gap={count_gap}")

            # Mild penalty avoids accepting many weak overlapping alternatives.
            score -= len(state.items) * 0.08

            hypothesis = ReceiptHypothesis(
                items=list(state.items),
                target_total=target,
                declared_count=declared_count,
                items_total=items_total,
                counted_quantity=counted,
                score=round(score, 4),
                total_gap=total_gap,
                count_gap=count_gap,
                reasons=reasons,
            )
            if (
                best_hypothesis is None
                or hypothesis.score > best_hypothesis.score
            ):
                best_hypothesis = hypothesis

        assert best_hypothesis is not None
        return best_hypothesis

    def _prune(
        self,
        states: dict[tuple[int, int], _State] | None,
        target: TotalCandidate | None,
        declared_count: int | None,
    ) -> None:
        if not states or len(states) <= self.beam_width:
            return

        target_cents = (
            int(target.amount * 100)
            if target is not None
            else None
        )
        is_payable_target = (
            target is not None and target.kind == "payable"
        )

        def rank(
            entry: tuple[tuple[int, int], _State],
        ) -> float:
            (sum_cents, count), state = entry
            value = state.score
            if target_cents is not None:
                distance_weight = 0.005 if is_payable_target else 0.025
                value -= abs(sum_cents - target_cents) * distance_weight
            if declared_count is not None:
                count_weight = 5.0 if is_payable_target else 3.0
                value -= abs(count - declared_count) * count_weight
            return value

        kept = sorted(
            states.items(),
            key=rank,
            reverse=True,
        )[: self.beam_width]
        states.clear()
        states.update(kept)
