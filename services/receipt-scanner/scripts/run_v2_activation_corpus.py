from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import tempfile
import traceback
from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from receipt_scanner.service import DefaultPipelineRunner
from receipt_scanner.v2.corpus import CorpusCase, load_manifest


@dataclass(slots=True)
class ActivationResult:
    case_id: str
    mode: str
    parser_mode_requested: str
    parser_mode_used: str | None
    fallback_reasons: str
    expected_store: str | None
    actual_store: str | None
    store_match: bool | None
    expected_date: str | None
    actual_date: str | None
    date_match: bool | None
    expected_total: float | None
    actual_budget_amount: float | None
    total_match: bool | None
    expected_product_lines: int | None
    actual_product_lines: int | None
    product_lines_match: bool | None
    expected_quantity: int | None
    actual_quantity: float | None
    quantity_match: bool | None
    quality_status: str | None
    should_record_budget: bool
    elapsed_seconds: float
    verdict: str
    error: str | None


def _fold(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", value.upper())).strip()


def _decimal(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _match_text(expected: str, actual: str | None) -> bool | None:
    if not expected.strip():
        return None
    expected_folded = _fold(expected)
    actual_folded = _fold(actual)
    return (
        expected_folded == actual_folded
        or expected_folded in actual_folded
        or actual_folded in expected_folded
    )


def _match(expected: object, actual: object) -> bool | None:
    if expected is None or expected == "":
        return None
    return expected == actual


def _run_case(
    case: CorpusCase,
    *,
    manifest_dir: Path,
    parser_mode: str,
) -> ActivationResult:
    image_1 = case.resolved_image_1(manifest_dir)
    image_2 = case.resolved_image_2(manifest_dir)
    expected_total = _decimal(case.expected_total)
    expected_lines = _int(case.expected_product_lines)
    expected_quantity = _int(case.expected_quantity)
    started = datetime.now()
    error: str | None = None
    result = None

    try:
        runner = DefaultPipelineRunner(parser_mode=parser_mode)
        with tempfile.TemporaryDirectory(prefix="bkp-v2-activation-") as temp_dir:
            work_dir = Path(temp_dir)
            if case.mode == "long":
                if image_2 is None:
                    raise FileNotFoundError("Seconde image absente du manifeste")
                result = runner.run_long_receipt([image_1, image_2], work_dir)
            else:
                result = runner.run_single(image_1, work_dir)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"

    elapsed = (datetime.now() - started).total_seconds()
    if result is None:
        return ActivationResult(
            case_id=case.case_id,
            mode=case.mode,
            parser_mode_requested=parser_mode,
            parser_mode_used=None,
            fallback_reasons="",
            expected_store=case.expected_store or None,
            actual_store=None,
            store_match=False if case.expected_store else None,
            expected_date=case.expected_date or None,
            actual_date=None,
            date_match=False if case.expected_date else None,
            expected_total=float(expected_total) if expected_total is not None else None,
            actual_budget_amount=None,
            total_match=False if expected_total is not None else None,
            expected_product_lines=expected_lines,
            actual_product_lines=None,
            product_lines_match=False if expected_lines is not None else None,
            expected_quantity=expected_quantity,
            actual_quantity=None,
            quantity_match=False if expected_quantity is not None else None,
            quality_status=None,
            should_record_budget=False,
            elapsed_seconds=round(elapsed, 3),
            verdict="ERROR",
            error=error,
        )

    receipt = result.receipt
    quality = result.quality
    actual_budget = _decimal(quality.get("budget_amount"))
    if actual_budget is None:
        actual_budget = _decimal(receipt.total)
    actual_lines = len(receipt.items)
    actual_quantity = receipt.counted_quantity

    store_match = _match_text(case.expected_store, receipt.store_name)
    date_match = _match(case.expected_date or None, receipt.receipt_date)
    total_match = _match(expected_total, actual_budget)
    lines_match = _match(expected_lines, actual_lines)
    quantity_match = _match(
        expected_quantity,
        int(actual_quantity) if float(actual_quantity).is_integer() else actual_quantity,
    )

    active_checks = [
        value
        for value in (
            store_match,
            date_match,
            total_match,
            lines_match,
            quantity_match,
        )
        if value is not None
    ]
    used_expected_mode = (
        result.parser_mode_used == "v2_safe"
        if parser_mode == "v2_safe"
        else True
    )
    verdict = (
        "PASS"
        if not error
        and used_expected_mode
        and bool(quality.get("should_record_budget"))
        and all(active_checks)
        else "FAIL"
    )

    return ActivationResult(
        case_id=case.case_id,
        mode=case.mode,
        parser_mode_requested=parser_mode,
        parser_mode_used=result.parser_mode_used,
        fallback_reasons="|".join(result.v2_fallback_reasons),
        expected_store=case.expected_store or None,
        actual_store=receipt.store_name,
        store_match=store_match,
        expected_date=case.expected_date or None,
        actual_date=receipt.receipt_date,
        date_match=date_match,
        expected_total=float(expected_total) if expected_total is not None else None,
        actual_budget_amount=(
            float(actual_budget) if actual_budget is not None else None
        ),
        total_match=total_match,
        expected_product_lines=expected_lines,
        actual_product_lines=actual_lines,
        product_lines_match=lines_match,
        expected_quantity=expected_quantity,
        actual_quantity=actual_quantity,
        quantity_match=quantity_match,
        quality_status=str(quality.get("status") or "") or None,
        should_record_budget=bool(quality.get("should_record_budget")),
        elapsed_seconds=round(elapsed, 3),
        verdict=verdict,
        error=error,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Valide le chemin de production contrôlé du parseur V2."
    )
    parser.add_argument("--manifest", required=True)
    parser.add_argument(
        "--parser-mode",
        choices=("legacy", "shadow", "v2_safe"),
        default="v2_safe",
    )
    parser.add_argument("--output-root")
    args = parser.parse_args()

    manifest = Path(args.manifest).resolve()
    cases = [case for case in load_manifest(manifest) if case.enabled]
    if not cases:
        raise SystemExit("Aucun cas actif dans le manifeste")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_root = (
        Path(args.output_root).resolve()
        if args.output_root
        else Path.home() / "Downloads" / f"BudgetKazPei_activation_v2_{timestamp}"
    )
    output_root.mkdir(parents=True, exist_ok=True)

    results: list[ActivationResult] = []
    for index, case in enumerate(cases, start=1):
        print(f"[{index}/{len(cases)}] {case.case_id}")
        result = _run_case(
            case,
            manifest_dir=manifest.parent,
            parser_mode=args.parser_mode,
        )
        results.append(result)
        print(
            f"  {result.verdict} | mode={result.parser_mode_used} | "
            f"total={result.actual_budget_amount} | "
            f"lignes={result.actual_product_lines} | "
            f"quantité={result.actual_quantity}"
        )

    rows = [asdict(result) for result in results]
    json_path = output_root / "activation_results.json"
    csv_path = output_root / "activation_results.csv"
    summary_path = output_root / "summary.txt"

    json_path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    pass_count = sum(result.verdict == "PASS" for result in results)
    fail_count = sum(result.verdict == "FAIL" for result in results)
    error_count = sum(result.verdict == "ERROR" for result in results)
    summary = (
        "=== VALIDATION ACTIVATION V2 ===\n"
        f"Cas : {len(results)}\n"
        f"PASS : {pass_count}\n"
        f"FAIL : {fail_count}\n"
        f"ERROR : {error_count}\n"
        f"Mode demandé : {args.parser_mode}\n"
    )
    summary_path.write_text(summary, encoding="utf-8")
    print("\n" + summary)

    archive = shutil.make_archive(
        str(output_root),
        "zip",
        root_dir=output_root,
    )
    print(f"Rapport CSV : {csv_path}")
    print(f"Archive     : {archive}")
    print("Aucune donnée n'a été envoyée à BudgetKazPei ou à Supabase.")
    return 0 if fail_count == 0 and error_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
