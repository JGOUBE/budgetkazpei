from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from difflib import SequenceMatcher
from pathlib import Path
from statistics import mean, median
from typing import Any

from PIL import Image

from .column_detector import ColumnDetector, ColumnLayout
from .geometry_types import OCRBox, OCRDocument, OCRToken
from .image_preprocessor import ImagePreprocessor
from .line_reconstructor import (
    LineReconstructor,
    ReconstructedLine,
    save_reconstructed_lines,
)
from .quality_gate import ReceiptQualityGate
from .receipt_parser_fr import ReceiptParserFR


@dataclass(slots=True)
class AnchorLine:
    line_index: int
    raw_text: str
    normalized_text: str


@dataclass(slots=True)
class AnchorMatch:
    top_line_index: int
    bottom_line_index: int
    top_text: str
    bottom_text: str
    similarity: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "top_line_index": self.top_line_index,
            "bottom_line_index": self.bottom_line_index,
            "top_text": self.top_text,
            "bottom_text": self.bottom_text,
            "similarity": round(self.similarity, 4),
        }


@dataclass(slots=True)
class OverlapMatch:
    bottom_cut_line: int
    matched_anchor_count: int
    average_similarity: float
    top_trailing_line_count: int
    bottom_leading_line_count: int
    matches: list[AnchorMatch]

    def to_dict(self) -> dict[str, Any]:
        return {
            "bottom_cut_line": self.bottom_cut_line,
            "matched_anchor_count": self.matched_anchor_count,
            "average_similarity": round(self.average_similarity, 4),
            "top_trailing_line_count": self.top_trailing_line_count,
            "bottom_leading_line_count": self.bottom_leading_line_count,
            "matches": [match.to_dict() for match in self.matches],
        }


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _fold(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(
        char for char in value if not unicodedata.combining(char)
    )
    value = value.upper()
    value = value.replace("|", " ")
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _letters_only(value: str) -> str:
    return re.sub(r"[^A-Z]+", "", value)


def _description_signature(value: str) -> str:
    """
    Build a signature suitable for overlap detection.

    Prices, VAT codes and quantities are deliberately removed because common
    numeric lines such as "1.25 | 2" can occur many times on one receipt and
    must never be accepted as overlap anchors.
    """
    folded = _fold(value)
    words = []

    for word in folded.split():
        if any(char.isalpha() for char in word):
            words.append(word)

    return " ".join(words).strip()


def _is_anchor(signature: str) -> bool:
    letters = _letters_only(signature)

    if len(letters) < 5:
        return False

    # Reject generic financial/footer text as overlap evidence.
    blocked = {
        "TOTAL",
        "ARTICLES",
        "TTC",
        "TVA",
        "HT",
        "CB",
        "CODE",
        "RESTE",
        "PAYER",
        "BON",
        "IMMEDIAT",
    }
    words = set(signature.split())

    return not words.issubset(blocked)



_NUMERIC_MONEY_RE = re.compile(r"^[+\-]?\d+[.,]\d{2}$")
_VAT_CODE_RE = re.compile(r"^[1-9]$")


def _numeric_text(value: str) -> str:
    return re.sub(r"\s+", "", value.strip().upper()).replace("€", "")


def _numeric_signature(line: ReconstructedLine) -> tuple[str, ...]:
    values: list[str] = []
    for token in line.tokens:
        normalized = _numeric_text(token.text)
        if _NUMERIC_MONEY_RE.fullmatch(normalized) or _VAT_CODE_RE.fullmatch(normalized):
            values.append(normalized.replace(",", "."))
    return tuple(values)


def _extend_bottom_cut_over_numeric_overlap(
    top_lines: list[ReconstructedLine],
    bottom_lines: list[ReconstructedLine],
    overlap: OverlapMatch,
) -> int:
    """Remove numeric continuation rows belonging to the confirmed overlap.

    On curved tickets, a product price may appear just before its description
    in one photo and just after it in the other. Comparing only the line that
    follows the final text anchor is therefore insufficient. We collect the
    numeric signatures close to the final matched area of the top photo and
    remove only identical numeric-only rows at the beginning of the remaining
    bottom photo.
    """
    cut = overlap.bottom_cut_line
    last_top_anchor = overlap.matches[-1].top_line_index
    search_start = max(0, last_top_anchor - 3)

    top_numeric_signatures = {
        signature
        for line in top_lines[search_start:]
        if (signature := _numeric_signature(line))
    }

    while cut < len(bottom_lines):
        bottom_signature = _numeric_signature(bottom_lines[cut])

        if not bottom_signature:
            break
        if bottom_signature not in top_numeric_signatures:
            break

        cut += 1

    return cut



def _line_segment(line: ReconstructedLine) -> str | None:
    segments = {token.source_segment for token in line.tokens}
    return next(iter(segments)) if len(segments) == 1 else None


def _has_meaningful_description(line: ReconstructedLine) -> bool:
    for token in line.tokens:
        if token.column not in {"description", "detail"}:
            continue
        if re.search(r"[A-Za-zÀ-ÿ]", token.text):
            return True
    return False


def _has_price(line: ReconstructedLine) -> bool:
    return any(token.column == "price" for token in line.tokens)


def _is_financial_only(line: ReconstructedLine) -> bool:
    return _has_price(line) and not _has_meaningful_description(line)


def _is_description_without_price(line: ReconstructedLine) -> bool:
    return _has_meaningful_description(line) and not _has_price(line)


def _looks_like_section_header(line: ReconstructedLine) -> bool:
    normalized = _fold(line.text)
    raw = line.text.strip()
    return raw.startswith((">>", ">")) and len(normalized) >= 3


def _build_repaired_line(
    tokens: list[OCRToken],
    *,
    line_id: int,
) -> ReconstructedLine:
    ordered = sorted(tokens, key=lambda token: (token.box.x_min, token.index))

    for token in ordered:
        token.line_id = line_id

    return ReconstructedLine(
        line_id=line_id,
        tokens=ordered,
        center_y=float(median(token.box.center_y for token in ordered)),
        y_min=min(token.box.y_min for token in ordered),
        y_max=max(token.box.y_max for token in ordered),
    )


def _repair_staggered_financial_rows(
    lines: list[ReconstructedLine],
    *,
    max_center_gap: float = 36.0,
) -> tuple[list[ReconstructedLine], list[dict[str, Any]]]:
    """Attach vertically staggered prices to their descriptive rows.

    Perspective can shift the right-hand price column by 15–30 pixels relative
    to the product description. RapidOCR then returns two physical rows even
    though they belong to one receipt item. This repair is deliberately local
    to the two-photo pipeline and only joins adjacent rows from the same source
    photo.

    Supported patterns:
    - price/VAT row immediately before a product description;
    - product or detail row immediately before a price/VAT row.

    Section headers, cross-photo joins and large vertical gaps are excluded.
    """
    repaired: list[ReconstructedLine] = []
    repair_report: list[dict[str, Any]] = []
    index = 0

    while index < len(lines):
        current = lines[index]
        following = lines[index + 1] if index + 1 < len(lines) else None

        if following is not None:
            current_segment = _line_segment(current)
            following_segment = _line_segment(following)
            same_segment = (
                current_segment is not None
                and current_segment == following_segment
            )
            center_gap = abs(following.center_y - current.center_y)

            price_before_description = (
                same_segment
                and center_gap <= max_center_gap
                and _is_financial_only(current)
                and _is_description_without_price(following)
                and not _looks_like_section_header(following)
            )

            description_before_price = (
                same_segment
                and center_gap <= max_center_gap
                and _is_description_without_price(current)
                and not _looks_like_section_header(current)
                and _is_financial_only(following)
            )

            if price_before_description or description_before_price:
                combined_tokens = list(current.tokens) + list(following.tokens)
                repaired_line = _build_repaired_line(
                    combined_tokens,
                    line_id=len(repaired),
                )
                repaired.append(repaired_line)
                repair_report.append(
                    {
                        "mode": (
                            "price_before_description"
                            if price_before_description
                            else "description_before_price"
                        ),
                        "source_segment": current_segment,
                        "original_line_ids": [
                            current.line_id,
                            following.line_id,
                        ],
                        "center_gap": round(center_gap, 3),
                        "result_text": repaired_line.text,
                    }
                )
                index += 2
                continue

        repaired.append(
            _build_repaired_line(
                list(current.tokens),
                line_id=len(repaired),
            )
        )
        index += 1

    return repaired, repair_report



_MULTIBUY_PREFIX_RE = re.compile(r"^\s*(\d{1,3})\s*[Xx×]\s*(.*)$")


def _parse_money_token(value: str) -> Decimal | None:
    normalized = value.strip().upper().replace("€", "")
    normalized = re.sub(r"\s+", "", normalized).replace(",", ".")

    if not _NUMERIC_MONEY_RE.fullmatch(normalized):
        return None

    try:
        return Decimal(normalized)
    except InvalidOperation:
        return None


def _repair_multibuy_detail_rows(
    lines: list[ReconstructedLine],
) -> tuple[list[ReconstructedLine], list[dict[str, Any]]]:
    """Repair OCR-damaged ``quantity × unit price`` detail rows.

    A valid multibuy row can contain a reliable quantity and total while the
    unit price characters are partly confused by OCR, for example
    ``2 X 3.BC€ | 7.60 | 2``. When the previous row is a product description,
    quantity 2 and total 7.60 mathematically prove a unit price of 3.80.

    This repair never changes the item total. It only replaces the damaged
    unit-price text with the exact quotient ``total / quantity`` so the normal
    French receipt parser can associate the row with the preceding product.
    """
    repairs: list[dict[str, Any]] = []

    for index, line in enumerate(lines):
        if index == 0:
            continue

        previous = lines[index - 1]
        if not _is_description_without_price(previous):
            continue
        if _looks_like_section_header(previous):
            continue
        if _line_segment(previous) != _line_segment(line):
            continue

        price_tokens = [
            token for token in line.tokens if token.column == "price"
        ]
        if len(price_tokens) != 1:
            continue

        total = _parse_money_token(price_tokens[0].text)
        if total is None or total <= 0:
            continue

        candidate_token: OCRToken | None = None
        quantity: int | None = None

        for token in line.tokens:
            if token.column not in {"description", "detail"}:
                continue

            match = _MULTIBUY_PREFIX_RE.match(token.text)
            if match is None:
                continue

            parsed_quantity = int(match.group(1))
            if parsed_quantity < 2 or parsed_quantity > 99:
                continue

            candidate_token = token
            quantity = parsed_quantity
            break

        if candidate_token is None or quantity is None:
            continue

        unit_price = (total / Decimal(quantity)).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        expected_total = (unit_price * Decimal(quantity)).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

        # Only accept exact cent-level arithmetic. This avoids manufacturing a
        # unit price when the total is not evenly compatible with the stated
        # quantity.
        if expected_total != total.quantize(Decimal("0.01")):
            continue

        original_text = candidate_token.text
        candidate_token.text = f"{quantity} X {unit_price:.2f}€"
        candidate_token.column = "detail"

        repairs.append(
            {
                "mode": "multibuy_unit_price_from_total",
                "source_segment": _line_segment(line),
                "description_line_id": previous.line_id,
                "detail_line_id": line.line_id,
                "description": previous.text,
                "original_detail": original_text,
                "repaired_detail": candidate_token.text,
                "quantity": quantity,
                "unit_price": float(unit_price),
                "total_price": float(total),
            }
        )

    # Rebuild line geometry/text presentation without changing the receipt
    # order or joining unrelated rows.
    rebuilt = [
        _build_repaired_line(list(line.tokens), line_id=index)
        for index, line in enumerate(lines)
    ]
    return rebuilt, repairs


def _infer_bottom_layout(
    document: OCRDocument,
    lines: list[ReconstructedLine],
    *,
    overlap_cut_line: int,
) -> ColumnLayout:
    """Infer the bottom photo's own numeric columns.

    The two photos can have different perspective and horizontal framing. A
    single global TTC/TVA layout from the top image can therefore classify all
    bottom prices as VAT. We infer price and VAT anchors from numeric clusters
    in the confirmed overlap, then preserve those segment-specific columns in
    the merged document.
    """
    detector = ColumnDetector()
    region_end = min(len(lines), max(overlap_cut_line + 4, 12))
    price_centers: list[float] = []
    vat_centers: list[float] = []

    for line in lines[:region_end]:
        for token in line.tokens:
            normalized = _numeric_text(token.text)
            center_x = token.box.center_x

            if _NUMERIC_MONEY_RE.fullmatch(normalized):
                if center_x >= document.image_width * 0.55:
                    price_centers.append(center_x)
                continue

            if _VAT_CODE_RE.fullmatch(normalized):
                if center_x >= document.image_width * 0.68:
                    vat_centers.append(center_x)

    if len(price_centers) >= 2 and len(vat_centers) >= 2:
        price_anchor = float(median(price_centers))
        vat_anchor = float(median(vat_centers))

        if price_anchor < vat_anchor and (vat_anchor - price_anchor) >= 45:
            return detector._build_layout(
                price_anchor=price_anchor,
                vat_anchor=vat_anchor,
                source="overlap_numeric_clusters",
                header_line_id=None,
            )

    return detector.detect_layout(document, lines)


def _anchor_similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0

    sequence_score = SequenceMatcher(None, left, right).ratio()

    left_words = set(left.split())
    right_words = set(right.split())
    union = left_words | right_words
    word_score = (
        len(left_words & right_words) / len(union)
        if union
        else 0.0
    )

    left_letters = _letters_only(left)
    right_letters = _letters_only(right)
    letters_score = SequenceMatcher(
        None,
        left_letters,
        right_letters,
    ).ratio()

    return (
        0.45 * sequence_score
        + 0.20 * word_score
        + 0.35 * letters_score
    )


def _build_anchors(
    lines: list[ReconstructedLine],
    *,
    start: int,
    end: int,
) -> list[AnchorLine]:
    anchors: list[AnchorLine] = []

    for index in range(start, end):
        signature = _description_signature(lines[index].text)

        if not _is_anchor(signature):
            continue

        anchors.append(
            AnchorLine(
                line_index=index,
                raw_text=lines[index].text,
                normalized_text=signature,
            )
        )

    return anchors


def _best_monotonic_anchor_sequence(
    top_anchors: list[AnchorLine],
    bottom_anchors: list[AnchorLine],
) -> list[AnchorMatch]:
    """
    Find the strongest increasing sequence of descriptive line matches.

    This allows one OCR photo to split a row differently from the other while
    preserving the order of the receipt. Price-only lines cannot participate.
    """
    candidates: list[AnchorMatch] = []

    for top in top_anchors:
        for bottom in bottom_anchors:
            similarity = _anchor_similarity(
                top.normalized_text,
                bottom.normalized_text,
            )

            if similarity < 0.53:
                continue

            candidates.append(
                AnchorMatch(
                    top_line_index=top.line_index,
                    bottom_line_index=bottom.line_index,
                    top_text=top.raw_text,
                    bottom_text=bottom.raw_text,
                    similarity=similarity,
                )
            )

    if not candidates:
        return []

    candidates.sort(
        key=lambda item: (
            item.top_line_index,
            item.bottom_line_index,
        )
    )

    best_scores: list[float] = []
    predecessors: list[int | None] = []

    for current_index, current in enumerate(candidates):
        # Reward strong descriptive matches and mildly reward sequence length.
        best_score = current.similarity + 0.20
        best_predecessor: int | None = None

        for previous_index in range(current_index):
            previous = candidates[previous_index]

            if previous.top_line_index >= current.top_line_index:
                continue
            if previous.bottom_line_index >= current.bottom_line_index:
                continue

            top_gap = current.top_line_index - previous.top_line_index - 1
            bottom_gap = (
                current.bottom_line_index
                - previous.bottom_line_index
                - 1
            )

            # A repeated product much later in the second photo must not
            # extend the seam. OCR can split a couple of rows differently,
            # but it cannot justify deleting a long block of intervening
            # products from only one side.
            if max(top_gap, bottom_gap) > 4 and abs(top_gap - bottom_gap) > 2:
                continue

            # OCR may split lines differently, but very large unequal gaps are
            # unlikely to represent the same overlap sequence.
            gap_penalty = 0.025 * abs(top_gap - bottom_gap)
            gap_penalty += 0.008 * max(top_gap, bottom_gap)

            score = (
                best_scores[previous_index]
                + current.similarity
                + 0.20
                - gap_penalty
            )

            if score > best_score:
                best_score = score
                best_predecessor = previous_index

        best_scores.append(best_score)
        predecessors.append(best_predecessor)

    final_index = max(
        range(len(candidates)),
        key=lambda index: best_scores[index],
    )

    sequence: list[AnchorMatch] = []
    current_index: int | None = final_index

    while current_index is not None:
        sequence.append(candidates[current_index])
        current_index = predecessors[current_index]

    sequence.reverse()
    return sequence


def find_overlap(
    top_lines: list[ReconstructedLine],
    bottom_lines: list[ReconstructedLine],
    *,
    top_tail_limit: int = 28,
    bottom_head_limit: int = 18,
) -> OverlapMatch:
    if len(top_lines) < 3 or len(bottom_lines) < 3:
        raise RuntimeError(
            "Pas assez de lignes lisibles pour raccorder les deux photos."
        )

    top_start = max(0, len(top_lines) - top_tail_limit)
    bottom_end = min(len(bottom_lines), bottom_head_limit)

    top_anchors = _build_anchors(
        top_lines,
        start=top_start,
        end=len(top_lines),
    )
    bottom_anchors = _build_anchors(
        bottom_lines,
        start=0,
        end=bottom_end,
    )

    sequence = _best_monotonic_anchor_sequence(
        top_anchors,
        bottom_anchors,
    )

    if len(sequence) < 3:
        raise RuntimeError(
            "Chevauchement insuffisant. Reprenez les deux photos avec "
            "environ 15 à 25 % du ticket visible sur les deux images."
        )

    # Keep only the strongest coherent part of the sequence. Isolated weak
    # matches at either end are discarded.
    while sequence and sequence[0].similarity < 0.58:
        sequence.pop(0)
    while sequence and sequence[-1].similarity < 0.58:
        sequence.pop()

    if len(sequence) < 3:
        raise RuntimeError(
            "Le chevauchement détecté n'est pas assez fiable."
        )

    similarities = [match.similarity for match in sequence]
    average_similarity = mean(similarities)
    strong_count = sum(value >= 0.72 for value in similarities)

    first = sequence[0]
    last = sequence[-1]
    top_trailing = len(top_lines) - 1 - last.top_line_index
    bottom_leading = first.bottom_line_index

    # Safety rules:
    # - overlap must begin near the top of the bottom photo;
    # - overlap must reach near the end of the top photo;
    # - at least two anchors must be strong.
    if bottom_leading > 3:
        raise RuntimeError(
            "La partie commune commence trop bas dans la seconde photo."
        )
    if top_trailing > 5:
        raise RuntimeError(
            "La partie commune ne rejoint pas suffisamment la fin de "
            "la première photo."
        )
    if average_similarity < 0.60 or strong_count < 2:
        raise RuntimeError(
            "Le raccord est ambigu. Reprenez les photos avec davantage "
            "de lignes communes clairement visibles."
        )

    # Remove only the confirmed prefix of the bottom photo. This conservative
    # choice may keep a doubtful duplicate, but it never deletes new products.
    bottom_cut_line = last.bottom_line_index + 1

    return OverlapMatch(
        bottom_cut_line=bottom_cut_line,
        matched_anchor_count=len(sequence),
        average_similarity=average_similarity,
        top_trailing_line_count=top_trailing,
        bottom_leading_line_count=bottom_leading,
        matches=sequence,
    )


def _clone_token(
    token: OCRToken,
    *,
    index: int,
    x_shift: float,
    y_shift: float,
    source_segment: str,
) -> OCRToken:
    box = OCRBox.from_raw(
        [
            [token.box.x_min + x_shift, token.box.y_min + y_shift],
            [token.box.x_max + x_shift, token.box.y_min + y_shift],
            [token.box.x_max + x_shift, token.box.y_max + y_shift],
            [token.box.x_min + x_shift, token.box.y_max + y_shift],
        ]
    )

    return OCRToken(
        index=index,
        text=token.text,
        score=float(token.score),
        box=box,
        column=token.column,
        source_segment=source_segment,
    )


def run_long_receipt_pipeline(
    image_paths: list[str | Path],
    *,
    output_root: str | Path = "output",
    run_id: str = "ticket_long",
    max_side: int = 1600,
    use_cls: bool = False,
    ocr_engine: Any | None = None,
) -> dict[str, Any]:
    """Merge two or three ordered segments through the proven pairwise seam.

    Three-photo receipts are joined sequentially: 1+2, then the merged result
    +3.  Each seam therefore remains local to adjacent photos, so an identical
    product elsewhere on the receipt is never removed merely because its name
    and price repeat.
    """
    sources = [Path(path) for path in image_paths]
    if len(sources) not in {2, 3}:
        raise ValueError("A long receipt requires exactly two or three segments")
    for source in sources:
        if not source.is_file():
            raise FileNotFoundError(f"Receipt segment not found: {source}")

    if len(sources) == 2:
        summary = run_two_photo_pipeline(
            sources[0],
            sources[1],
            output_root=output_root,
            run_id=run_id,
            max_side=max_side,
            use_cls=use_cls,
            ocr_engine=ocr_engine,
        )
        pair = dict(summary["overlap"])
        pair.update({"first_segment": 1, "second_segment": 2})
        summary["segment_count"] = 2
        summary["segment_sources"] = [str(source) for source in sources]
        summary["overlap"] = {
            **summary["overlap"],
            "used": True,
            "segment_count": 2,
            "pairs": [pair],
        }
        summary["preprocessing"]["segments"] = [
            summary["preprocessing"]["top"],
            summary["preprocessing"]["bottom"],
        ]
        _write_json(Path(summary["files"]["overlap_report"]), summary["overlap"])
        _write_json(Path(summary["files"]["summary"]), summary)
        return summary

    try:
        first_join = run_two_photo_pipeline(
            sources[0],
            sources[1],
            output_root=output_root,
            run_id=f"{run_id}/pair-1-2",
            max_side=max_side,
            use_cls=use_cls,
            ocr_engine=ocr_engine,
        )
        final_join = run_two_photo_pipeline(
            first_join["files"]["merged_preprocessed"],
            sources[2],
            output_root=output_root,
            run_id=f"{run_id}/final",
            # Preserve the resolution of the already joined top+middle image;
            # shrinking it back to one-photo height would make its text tiny.
            max_side=max_side * 2,
            use_cls=use_cls,
            ocr_engine=ocr_engine,
            # On a three-photo receipt, the middle/bottom overlap can span
            # more than 18 reconstructed lines. Search farther into the
            # bottom photo without relaxing any overlap quality threshold.
            overlap_bottom_head_limit=36,
        )
    except RuntimeError as exc:
        lowered = str(exc).lower()
        if (
            "chevauchement" in lowered
            or "raccord" in lowered
            or "partie commune" in lowered
        ):
            raise RuntimeError(
                "long_receipt_overlap_unreliable: chevauchement adjacent "
                "insuffisant"
            ) from exc
        raise

    first_pair = dict(first_join["overlap"])
    first_pair.update({"first_segment": 1, "second_segment": 2})
    second_pair = dict(final_join["overlap"])
    second_pair.update({"first_segment": 2, "second_segment": 3})
    similarities = [
        float(first_pair.get("average_similarity") or 0),
        float(second_pair.get("average_similarity") or 0),
    ]
    anchor_counts = [
        int(first_pair.get("matched_anchor_count") or 0),
        int(second_pair.get("matched_anchor_count") or 0),
    ]

    final_join["run_id"] = run_id
    final_join["segment_count"] = 3
    final_join["segment_sources"] = [str(source) for source in sources]
    final_join["overlap"] = {
        "used": True,
        "segment_count": 3,
        "matched_anchor_count": min(anchor_counts),
        "average_similarity": round(mean(similarities), 6),
        "pairs": [first_pair, second_pair],
    }
    final_join["preprocessing"] = {
        "segments": [
            first_join["preprocessing"]["top"],
            first_join["preprocessing"]["bottom"],
            final_join["preprocessing"]["bottom"],
        ],
        # Compatibility aliases for existing diagnostics consumers.
        "top": first_join["preprocessing"]["top"],
        "bottom": final_join["preprocessing"]["bottom"],
    }
    final_join["ocr"]["elapsed_seconds_total"] = round(
        float(first_join["ocr"].get("elapsed_seconds_total") or 0)
        + float(final_join["ocr"].get("elapsed_seconds_total") or 0),
        3,
    )
    _write_json(
        Path(final_join["files"]["overlap_report"]),
        final_join["overlap"],
    )
    _write_json(Path(final_join["files"]["summary"]), final_join)
    return final_join


def run_two_photo_pipeline(
    top_image_path: str | Path,
    bottom_image_path: str | Path,
    *,
    output_root: str | Path = "output",
    run_id: str = "ticket_long_2_photos",
    max_side: int = 1600,
    use_cls: bool = False,
    ocr_engine: Any | None = None,
    overlap_bottom_head_limit: int = 18,
) -> dict[str, Any]:
    top_source = Path(top_image_path)
    bottom_source = Path(bottom_image_path)

    if not top_source.is_file():
        raise FileNotFoundError(f"Top image not found: {top_source}")
    if not bottom_source.is_file():
        raise FileNotFoundError(f"Bottom image not found: {bottom_source}")

    if ocr_engine is None:
        from .ocr_engine import RapidOCREngine

        ocr_engine = RapidOCREngine(use_cls=use_cls)

    run_dir = Path(output_root) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    top_preprocessed = run_dir / "top_preprocessed.jpg"
    bottom_preprocessed = run_dir / "bottom_preprocessed.jpg"
    top_ocr_path = run_dir / "top_ocr.json"
    bottom_ocr_path = run_dir / "bottom_ocr.json"
    merged_image_path = run_dir / "merged_preprocessed.jpg"
    merged_ocr_path = run_dir / "merged_ocr.json"
    raw_reconstructed_path = run_dir / "raw_reconstructed_lines.json"
    reconstructed_path = run_dir / "reconstructed_lines.json"
    staggered_repairs_path = run_dir / "staggered_repairs.json"
    multibuy_repairs_path = run_dir / "multibuy_repairs.json"
    columnized_path = run_dir / "columnized_ocr.json"
    parsed_path = run_dir / "parsed_receipt.json"
    quality_path = run_dir / "quality_decision.json"
    overlap_path = run_dir / "overlap_report.json"
    summary_path = run_dir / "summary.json"

    processor = ImagePreprocessor(max_side=max_side)
    top_preprocessing = processor.process(
        top_source,
        top_preprocessed,
    )
    bottom_preprocessing = processor.process(
        bottom_source,
        bottom_preprocessed,
    )

    top_document = ocr_engine.analyze(
        top_preprocessed,
        source_segment="top",
    )
    bottom_document = ocr_engine.analyze(
        bottom_preprocessed,
        source_segment="bottom",
    )
    top_document.save_json(top_ocr_path)
    bottom_document.save_json(bottom_ocr_path)

    if not top_document.tokens or not bottom_document.tokens:
        raise RuntimeError(
            "Une des deux photos ne contient aucun texte lisible."
        )

    reconstructor = LineReconstructor()
    top_lines = reconstructor.reconstruct(top_document)
    bottom_lines = reconstructor.reconstruct(bottom_document)
    overlap = find_overlap(
        top_lines,
        bottom_lines,
        bottom_head_limit=overlap_bottom_head_limit,
    )
    overlap.bottom_cut_line = _extend_bottom_cut_over_numeric_overlap(
        top_lines,
        bottom_lines,
        overlap,
    )

    detector = ColumnDetector()
    top_layout = detector.assign_columns(top_document, top_lines)
    bottom_layout = _infer_bottom_layout(
        bottom_document,
        bottom_lines,
        overlap_cut_line=overlap.bottom_cut_line,
    )
    for token in bottom_document.tokens:
        token.column = detector.classify_token(token, bottom_layout)

    kept_bottom_lines = bottom_lines[overlap.bottom_cut_line:]

    if not kept_bottom_lines:
        raise RuntimeError(
            "La seconde photo n'ajoute pas assez de contenu après le raccord."
        )

    kept_bottom_indexes = {
        token.index
        for line in kept_bottom_lines
        for token in line.tokens
    }

    with Image.open(top_preprocessed) as opened:
        top_image = opened.convert("RGB")
    with Image.open(bottom_preprocessed) as opened:
        bottom_image = opened.convert("RGB")

    canvas_width = max(top_image.width, bottom_image.width)
    top_x = (canvas_width - top_image.width) // 2
    bottom_x = (canvas_width - bottom_image.width) // 2

    first_kept_y = min(line.y_min for line in kept_bottom_lines)
    crop_margin = 20
    bottom_crop_y = max(0, int(first_kept_y) - crop_margin)
    bottom_crop = bottom_image.crop(
        (0, bottom_crop_y, bottom_image.width, bottom_image.height)
    )

    vertical_gap = 24
    bottom_paste_y = top_image.height + vertical_gap
    merged_height = bottom_paste_y + bottom_crop.height

    merged_image = Image.new(
        "RGB",
        (canvas_width, merged_height),
        "white",
    )
    merged_image.paste(top_image, (top_x, 0))
    merged_image.paste(bottom_crop, (bottom_x, bottom_paste_y))
    merged_image.save(
        merged_image_path,
        format="JPEG",
        quality=92,
        optimize=True,
        subsampling=0,
    )

    merged_tokens: list[OCRToken] = []
    next_index = 0

    for token in top_document.tokens:
        merged_tokens.append(
            _clone_token(
                token,
                index=next_index,
                x_shift=float(top_x),
                y_shift=0.0,
                source_segment="top",
            )
        )
        next_index += 1

    bottom_y_shift = float(bottom_paste_y - bottom_crop_y)

    for token in bottom_document.tokens:
        if token.index not in kept_bottom_indexes:
            continue

        merged_tokens.append(
            _clone_token(
                token,
                index=next_index,
                x_shift=float(bottom_x),
                y_shift=bottom_y_shift,
                source_segment="bottom",
            )
        )
        next_index += 1

    merged_document = OCRDocument(
        source=f"{top_source}+{bottom_source}",
        image_width=canvas_width,
        image_height=merged_height,
        elapsed_seconds=round(
            top_document.elapsed_seconds + bottom_document.elapsed_seconds,
            3,
        ),
        tokens=merged_tokens,
        engine="rapidocr-onnxruntime-two-photo",
    )
    merged_document.save_json(merged_ocr_path)

    raw_merged_lines = reconstructor.reconstruct(merged_document)
    save_reconstructed_lines(
        merged_document,
        raw_merged_lines,
        raw_reconstructed_path,
    )

    merged_lines, staggered_repairs = _repair_staggered_financial_rows(
        raw_merged_lines
    )
    merged_lines, multibuy_repairs = _repair_multibuy_detail_rows(
        merged_lines
    )

    # Columns were classified independently for each photo before merging.
    # Do not overwrite them with one global layout. The repair above only
    # reattaches already-classified tokens to their true product row.
    merged_document.save_json(columnized_path)
    save_reconstructed_lines(
        merged_document,
        merged_lines,
        reconstructed_path,
    )
    _write_json(
        staggered_repairs_path,
        {
            "repair_count": len(staggered_repairs),
            "repairs": staggered_repairs,
        },
    )
    _write_json(
        multibuy_repairs_path,
        {
            "repair_count": len(multibuy_repairs),
            "repairs": multibuy_repairs,
        },
    )

    receipt = ReceiptParserFR().parse(
        merged_document,
        merged_lines,
    )
    receipt.save_json(parsed_path)

    quality = ReceiptQualityGate().evaluate(
        merged_image_path,
        merged_document,
        receipt,
    )
    quality.save_json(quality_path)

    overlap_report = overlap.to_dict()
    overlap_report["bottom_lines_removed_as_overlap"] = (
        overlap.bottom_cut_line
    )
    _write_json(overlap_path, overlap_report)

    summary = {
        "run_id": run_id,
        "top_source": str(top_source),
        "bottom_source": str(bottom_source),
        "preprocessing": {
            "top": top_preprocessing.to_dict(),
            "bottom": bottom_preprocessing.to_dict(),
        },
        "ocr": {
            "top_token_count": len(top_document.tokens),
            "bottom_token_count": len(bottom_document.tokens),
            "merged_token_count": len(merged_document.tokens),
            "elapsed_seconds_total": merged_document.elapsed_seconds,
            "staggered_repair_count": len(staggered_repairs),
            "multibuy_repair_count": len(multibuy_repairs),
        },
        "overlap": overlap_report,
        "layout": {
            "top": top_layout.to_dict(),
            "bottom": bottom_layout.to_dict(),
        },
        "receipt": {
            "store_name": receipt.store_name,
            "store_location": receipt.store_location,
            "receipt_date": receipt.receipt_date,
            "receipt_time": receipt.receipt_time,
            "declared_item_count": receipt.declared_item_count,
            "product_line_count": len(receipt.items),
            "counted_quantity": receipt.counted_quantity,
            "items_total": receipt.items_total,
            "total": receipt.total,
            "article_total": receipt.article_total,
            "immediate_discount_total": receipt.immediate_discount_total,
            "payable_total": receipt.payable_total,
            "warning_count": len(receipt.warnings),
            "warnings": receipt.warnings,
        },
        "quality": {
            "status": quality.status,
            "exploitable": quality.exploitable,
            "budget_amount": quality.budget_amount,
            "unattributed_amount": quality.unattributed_amount,
            "should_feed_courses": quality.should_feed_courses,
            "should_feed_market_database": (
                quality.should_feed_market_database
            ),
            "requires_user_validation": (
                quality.requires_user_validation
            ),
            "reasons": quality.reasons,
        },
        "files": {
            "top_preprocessed": str(top_preprocessed),
            "bottom_preprocessed": str(bottom_preprocessed),
            "top_ocr": str(top_ocr_path),
            "bottom_ocr": str(bottom_ocr_path),
            "merged_preprocessed": str(merged_image_path),
            "merged_ocr": str(merged_ocr_path),
            "overlap_report": str(overlap_path),
            "raw_reconstructed_lines": str(raw_reconstructed_path),
            "staggered_repairs": str(staggered_repairs_path),
            "multibuy_repairs": str(multibuy_repairs_path),
            "reconstructed_lines": str(reconstructed_path),
            "columnized_ocr": str(columnized_path),
            "parsed_receipt": str(parsed_path),
            "quality_decision": str(quality_path),
            "summary": str(summary_path),
        },
    }

    _write_json(summary_path, summary)
    return summary


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Raccorde et analyse un ticket long photographié en deux ou trois "
            "parties ordonnées avec chevauchement."
        )
    )
    parser.add_argument(
        "images",
        nargs="+",
        help="Deux ou trois photos dans l'ordre du haut vers le bas",
    )
    parser.add_argument(
        "--run-id",
        default="ticket_long",
        help="Nom du dossier de résultat",
    )
    parser.add_argument(
        "--output-root",
        default="output",
        help="Dossier racine des résultats",
    )
    parser.add_argument(
        "--max-side",
        type=int,
        default=1600,
        help="Taille maximale de chaque photo préparée",
    )
    parser.add_argument(
        "--use-cls",
        action="store_true",
        help="Active la classification d'orientation du texte",
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()

    summary = run_long_receipt_pipeline(
        args.images,
        output_root=args.output_root,
        run_id=args.run_id,
        max_side=args.max_side,
        use_cls=args.use_cls,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
