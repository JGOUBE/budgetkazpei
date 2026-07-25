from __future__ import annotations

import csv
import hashlib
import html
import json
import os
import re
import shutil
import traceback
from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

from ..column_detector import ColumnDetector
from ..geometry_types import OCRDocument, OCRToken
from ..image_preprocessor import ImagePreprocessor
from ..line_reconstructor import LineReconstructor, ReconstructedLine
from ..long_receipt_pipeline import run_two_photo_pipeline
from ..ocr_engine import RapidOCREngine
from ..quality_gate import ReceiptQualityGate
from ..receipt_parser_fr import ReceiptParserFR
from .shadow_parser import GenericReceiptParserV2


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
GENERATED_IMAGE_MARKERS = (
    "preprocessed",
    "merged_preprocessed",
    "debug",
    "annotated",
    "overlay",
    "crop",
)


@dataclass(slots=True)
class CorpusCase:
    case_id: str
    enabled: bool
    mode: str
    image_1: str
    image_2: str = ""
    expected_store: str = ""
    expected_date: str = ""
    expected_total: str = ""
    expected_product_lines: str = ""
    expected_quantity: str = ""
    expected_status: str = ""
    notes: str = ""

    def resolved_image_1(self, base_dir: Path) -> Path:
        return resolve_path(self.image_1, base_dir)

    def resolved_image_2(self, base_dir: Path) -> Path | None:
        if not self.image_2.strip():
            return None
        return resolve_path(self.image_2, base_dir)


@dataclass(slots=True)
class CorpusResult:
    case_id: str
    mode: str
    image_1: str
    image_2: str
    image_hash: str
    elapsed_seconds: float
    engine_status: str
    expected_store: str | None
    v2_store: str | None
    legacy_store: str | None
    store_match: bool | None
    expected_date: str | None
    v2_date: str | None
    legacy_date: str | None
    date_match: bool | None
    expected_total: float | None
    v2_total: float | None
    v2_items_total: float | None
    legacy_total: float | None
    legacy_items_total: float | None
    total_match: bool | None
    expected_product_lines: int | None
    v2_product_lines: int
    legacy_product_lines: int | None
    product_lines_match: bool | None
    expected_quantity: int | None
    v2_quantity: int
    legacy_quantity: float | None
    quantity_match: bool | None
    v2_total_gap: float | None
    v2_count_gap: int | None
    v2_reasons: str
    expected_status: str | None
    quality_status: str | None
    date_requires_review: bool
    review_reasons: str
    verdict: str
    error: str | None
    diagnostic_dir: str
    notes: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def fold(value: str | None) -> str:
    if not value:
        return ""
    value = value.upper()
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def resolve_path(value: str, base_dir: Path) -> Path:
    expanded = os.path.expandvars(os.path.expanduser(value.strip()))
    path = Path(expanded)
    if not path.is_absolute():
        path = base_dir / path
    return path.resolve()


def parse_bool(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() not in {
        "",
        "0",
        "false",
        "non",
        "no",
        "off",
    }


def parse_decimal(value: str | float | int | None) -> Decimal | None:
    if value is None or str(value).strip() == "":
        return None
    normalized = (
        str(value)
        .strip()
        .replace("€", "")
        .replace("EUR", "")
        .replace(" ", "")
        .replace(",", ".")
    )
    try:
        return Decimal(normalized).quantize(Decimal("0.01"))
    except InvalidOperation:
        raise ValueError(f"Montant invalide dans le manifeste : {value!r}")


def parse_int(value: str | float | int | None) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    return int(float(str(value).strip().replace(",", ".")))


def file_hash(paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.name.encode("utf-8", errors="replace"))
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: str | Path) -> list[CorpusCase]:
    manifest = Path(path)
    with manifest.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"case_id", "enabled", "mode", "image_1"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(
                "Colonnes manquantes dans le manifeste : "
                + ", ".join(sorted(missing))
            )

        cases: list[CorpusCase] = []
        seen_ids: set[str] = set()
        for line_number, row in enumerate(reader, start=2):
            case_id = (row.get("case_id") or "").strip()
            if not case_id:
                raise ValueError(
                    f"case_id vide à la ligne {line_number} du manifeste"
                )
            if case_id in seen_ids:
                raise ValueError(f"case_id dupliqué : {case_id}")
            seen_ids.add(case_id)

            mode = (row.get("mode") or "single").strip().lower()
            if mode not in {"single", "long"}:
                raise ValueError(
                    f"Mode invalide pour {case_id}: {mode!r}. "
                    "Utiliser single ou long."
                )

            cases.append(
                CorpusCase(
                    case_id=case_id,
                    enabled=parse_bool(row.get("enabled")),
                    mode=mode,
                    image_1=(row.get("image_1") or "").strip(),
                    image_2=(row.get("image_2") or "").strip(),
                    expected_store=(row.get("expected_store") or "").strip(),
                    expected_date=(row.get("expected_date") or "").strip(),
                    expected_total=(row.get("expected_total") or "").strip(),
                    expected_product_lines=(
                        row.get("expected_product_lines") or ""
                    ).strip(),
                    expected_quantity=(
                        row.get("expected_quantity") or ""
                    ).strip(),
                    expected_status=(
                        row.get("expected_status") or ""
                    ).strip(),
                    notes=(row.get("notes") or "").strip(),
                )
            )
    return cases


def discover_images(folder: str | Path) -> list[Path]:
    root = Path(folder)
    found: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        lower_name = path.name.lower()
        if any(marker in lower_name for marker in GENERATED_IMAGE_MARKERS):
            continue
        found.append(path.resolve())
    return found


def write_discovered_manifest(
    paths: list[Path],
    output_path: str | Path,
) -> Path:
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    headers = [
        "case_id",
        "enabled",
        "mode",
        "image_1",
        "image_2",
        "expected_store",
        "expected_date",
        "expected_total",
        "expected_product_lines",
        "expected_quantity",
        "expected_status",
        "notes",
    ]
    with destination.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for index, path in enumerate(paths, start=1):
            writer.writerow(
                {
                    "case_id": f"DISCOVERED_{index:03d}",
                    "enabled": "1",
                    "mode": "single",
                    "image_1": str(path),
                    "image_2": "",
                    "expected_store": "",
                    "expected_date": "",
                    "expected_total": "",
                    "expected_product_lines": "",
                    "expected_quantity": "",
                    "expected_status": "",
                    "notes": "Valeurs attendues à compléter après vérification.",
                }
            )
    return destination


def _load_reconstructed_lines(path: str | Path) -> list[ReconstructedLine]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    lines: list[ReconstructedLine] = []
    for row in payload.get("lines", []):
        tokens = [OCRToken.from_dict(item) for item in row.get("tokens", [])]
        lines.append(
            ReconstructedLine(
                line_id=int(row["line_id"]),
                tokens=tokens,
                center_y=float(row["center_y"]),
                y_min=float(row["y_min"]),
                y_max=float(row["y_max"]),
            )
        )
    return lines


def _best_total(selected: dict[str, Any]) -> Decimal | None:
    target = selected.get("target_total") or {}
    return parse_decimal(target.get("amount"))


def _legacy_total(payload: dict[str, Any]) -> Decimal | None:
    for key in ("payable_total", "total", "article_total"):
        amount = parse_decimal(payload.get(key))
        if amount is not None:
            return amount
    return None


def _date_from_legacy(payload: dict[str, Any]) -> str | None:
    value = payload.get("receipt_date")
    return str(value) if value else None


def _store_from_legacy(payload: dict[str, Any]) -> str | None:
    value = payload.get("store_name")
    return str(value) if value else None


def _v2_identity(
    legacy: dict[str, Any],
) -> tuple[str | None, str | None]:
    # Phase 4 compares V2 structure while keeping the already proven identity
    # extraction from the shared OCR/legacy parser. Identity extraction will
    # receive its own generic V2 layer later.
    return _store_from_legacy(legacy), _date_from_legacy(legacy)


def _single_case(
    image: Path,
    diagnostic_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any], str | None, float]:
    diagnostic_dir.mkdir(parents=True, exist_ok=True)
    started = datetime.now()

    preprocessed = diagnostic_dir / "preprocessed.jpg"
    preprocessing = ImagePreprocessor(max_side=1600).process(
        image,
        preprocessed,
    )
    document = RapidOCREngine(use_cls=False).analyze(preprocessed)
    lines = LineReconstructor().reconstruct(document)
    if document.tokens:
        ColumnDetector().assign_columns(document, lines)

    document.save_json(diagnostic_dir / "ocr_document.json")
    legacy_receipt = ReceiptParserFR().parse(document, lines)
    legacy_receipt.save_json(diagnostic_dir / "legacy_receipt.json")
    legacy = legacy_receipt.to_dict()

    v2 = GenericReceiptParserV2().analyze(
        document,
        lines,
        legacy_receipt=legacy_receipt,
    )
    (diagnostic_dir / "v2_shadow_result.json").write_text(
        json.dumps(v2, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (diagnostic_dir / "preprocessing.json").write_text(
        json.dumps(preprocessing.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    quality_status: str | None = None
    try:
        quality = ReceiptQualityGate().evaluate(
            preprocessed,
            document,
            legacy_receipt,
        )
        quality.save_json(diagnostic_dir / "quality_decision.json")
        quality_status = quality.status
    except Exception as exc:  # diagnostic must continue
        (diagnostic_dir / "quality_error.txt").write_text(
            str(exc),
            encoding="utf-8",
        )

    elapsed = (datetime.now() - started).total_seconds()
    return legacy, v2, quality_status, elapsed


def _long_case(
    top: Path,
    bottom: Path,
    diagnostic_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any], str | None, float]:
    started = datetime.now()
    summary = run_two_photo_pipeline(
        top,
        bottom,
        output_root=diagnostic_dir.parent,
        run_id=diagnostic_dir.name,
        max_side=1600,
        use_cls=False,
    )

    document = OCRDocument.load_json(summary["files"]["columnized_ocr"])
    lines = _load_reconstructed_lines(summary["files"]["reconstructed_lines"])
    legacy = dict(summary["receipt"])

    v2 = GenericReceiptParserV2().analyze(
        document,
        lines,
        legacy_receipt=legacy,
    )
    (diagnostic_dir / "v2_shadow_result.json").write_text(
        json.dumps(v2, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    quality_status = (summary.get("quality") or {}).get("status")
    elapsed = (datetime.now() - started).total_seconds()
    return legacy, v2, quality_status, elapsed


def _match_text(expected: str, actual: str | None) -> bool | None:
    if not expected.strip():
        return None
    expected_folded = fold(expected)
    actual_folded = fold(actual)
    return (
        expected_folded == actual_folded
        or expected_folded in actual_folded
        or actual_folded in expected_folded
    )


def _match_date(expected: str, actual: str | None) -> bool | None:
    if not expected.strip():
        return None
    return expected.strip() == (actual or "").strip()


def _match_money(
    expected: Decimal | None,
    actual: Decimal | None,
) -> bool | None:
    if expected is None:
        return None
    if actual is None:
        return False
    return abs(expected - actual) <= Decimal("0.01")


def _match_int(expected: int | None, actual: int) -> bool | None:
    if expected is None:
        return None
    return expected == actual


def _verdict(
    *,
    store_match: bool | None,
    date_match: bool | None,
    total_match: bool | None,
    product_lines_match: bool | None,
    quantity_match: bool | None,
    expected_status: str | None,
    error: str | None,
) -> tuple[str, bool, list[str]]:
    """Classify a corpus result without treating a date review as a scan failure.

    A ticket may be budget- and article-safe while its date still needs a
    human confirmation. This is deliberately narrower than a generic warning:
    any mismatch involving store, total, product lines, or quantity remains a
    real FAIL.
    """
    if error:
        return "ERROR", False, []

    core_checks = [
        store_match,
        total_match,
        product_lines_match,
        quantity_match,
    ]
    active_core = [value for value in core_checks if value is not None]

    if any(value is False for value in active_core):
        return "FAIL", False, []

    review_expected = (
        (expected_status or "").strip().lower()
        == "date_requires_review"
    )
    date_requires_review = review_expected and date_match is not True

    if date_match is False and not review_expected:
        return "FAIL", False, []

    has_any_expectation = bool(active_core) or date_match is not None
    if not has_any_expectation and not review_expected:
        return "OBSERVE", False, []

    if date_requires_review:
        return (
            "PASS_WITH_REVIEW",
            True,
            ["date_requires_review"],
        )

    return "PASS", False, []


def run_case(
    case: CorpusCase,
    *,
    manifest_dir: Path,
    output_root: Path,
) -> CorpusResult:
    image_1 = case.resolved_image_1(manifest_dir)
    image_2 = case.resolved_image_2(manifest_dir)
    expected_total = parse_decimal(case.expected_total)
    expected_lines = parse_int(case.expected_product_lines)
    expected_quantity = parse_int(case.expected_quantity)

    diagnostic_dir = output_root / "diagnostics" / case.case_id
    error: str | None = None
    legacy: dict[str, Any] = {}
    v2: dict[str, Any] = {
        "selected_hypothesis": {
            "items": [],
            "items_total": 0,
            "counted_quantity": 0,
            "target_total": None,
            "total_gap": None,
            "count_gap": None,
            "reasons": [],
        }
    }
    quality_status: str | None = None
    elapsed = 0.0

    paths = [image_1] + ([image_2] if image_2 is not None else [])
    valid_paths = [path for path in paths if path is not None and path.is_file()]
    digest = file_hash(valid_paths) if valid_paths else ""

    try:
        if not image_1.is_file():
            raise FileNotFoundError(f"Image introuvable : {image_1}")
        if case.mode == "long":
            if image_2 is None or not image_2.is_file():
                raise FileNotFoundError(
                    f"Seconde image introuvable pour {case.case_id}: {image_2}"
                )
            legacy, v2, quality_status, elapsed = _long_case(
                image_1,
                image_2,
                diagnostic_dir,
            )
        else:
            legacy, v2, quality_status, elapsed = _single_case(
                image_1,
                diagnostic_dir,
            )
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        diagnostic_dir.mkdir(parents=True, exist_ok=True)
        (diagnostic_dir / "ERROR.txt").write_text(
            error + "\n\n" + traceback.format_exc(),
            encoding="utf-8",
        )

    selected = v2.get("selected_hypothesis") or {}
    items = selected.get("items") or []
    v2_total = _best_total(selected)
    v2_items_total = parse_decimal(selected.get("items_total")) or Decimal("0")
    legacy_total = _legacy_total(legacy)
    legacy_items_total = parse_decimal(legacy.get("items_total"))
    v2_store, v2_date = _v2_identity(legacy)
    legacy_store = _store_from_legacy(legacy)
    legacy_date = _date_from_legacy(legacy)

    store_match = _match_text(case.expected_store, v2_store)
    date_match = _match_date(case.expected_date, v2_date)
    total_match = _match_money(expected_total, v2_total)
    product_lines_match = _match_int(expected_lines, len(items))
    quantity_match = _match_int(
        expected_quantity,
        int(selected.get("counted_quantity") or 0),
    )

    verdict, date_requires_review, review_reasons = _verdict(
        store_match=store_match,
        date_match=date_match,
        total_match=total_match,
        product_lines_match=product_lines_match,
        quantity_match=quantity_match,
        expected_status=case.expected_status or None,
        error=error,
    )

    return CorpusResult(
        case_id=case.case_id,
        mode=case.mode,
        image_1=str(image_1),
        image_2=str(image_2) if image_2 else "",
        image_hash=digest,
        elapsed_seconds=round(elapsed, 3),
        engine_status="error" if error else "analyzed",
        expected_store=case.expected_store or None,
        v2_store=v2_store,
        legacy_store=legacy_store,
        store_match=store_match,
        expected_date=case.expected_date or None,
        v2_date=v2_date,
        legacy_date=legacy_date,
        date_match=date_match,
        expected_total=float(expected_total) if expected_total is not None else None,
        v2_total=float(v2_total) if v2_total is not None else None,
        v2_items_total=float(v2_items_total),
        legacy_total=float(legacy_total) if legacy_total is not None else None,
        legacy_items_total=(
            float(legacy_items_total)
            if legacy_items_total is not None
            else None
        ),
        total_match=total_match,
        expected_product_lines=expected_lines,
        v2_product_lines=len(items),
        legacy_product_lines=parse_int(
            legacy.get("product_line_count", len(legacy.get("items") or []))
        ),
        product_lines_match=product_lines_match,
        expected_quantity=expected_quantity,
        v2_quantity=int(selected.get("counted_quantity") or 0),
        legacy_quantity=(
            float(legacy.get("counted_quantity"))
            if legacy.get("counted_quantity") is not None
            else None
        ),
        quantity_match=quantity_match,
        v2_total_gap=(
            float(selected["total_gap"])
            if selected.get("total_gap") is not None
            else None
        ),
        v2_count_gap=(
            int(selected["count_gap"])
            if selected.get("count_gap") is not None
            else None
        ),
        v2_reasons=", ".join(selected.get("reasons") or []),
        expected_status=case.expected_status or None,
        quality_status=quality_status,
        date_requires_review=date_requires_review,
        review_reasons=", ".join(review_reasons),
        verdict=verdict,
        error=error,
        diagnostic_dir=str(diagnostic_dir),
        notes=case.notes,
    )


def _write_csv(results: list[CorpusResult], path: Path) -> None:
    rows = [item.to_dict() for item in results]
    if not rows:
        return
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _summary(results: list[CorpusResult]) -> dict[str, Any]:
    counts = {
        key: 0
        for key in (
            "PASS",
            "PASS_WITH_REVIEW",
            "FAIL",
            "OBSERVE",
            "ERROR",
        )
    }
    for result in results:
        counts[result.verdict] = counts.get(result.verdict, 0) + 1

    expected_cases = sum(
        1
        for result in results
        if any(
            value is not None
            for value in (
                result.expected_store,
                result.expected_date,
                result.expected_total,
                result.expected_product_lines,
                result.expected_quantity,
            )
        )
    )
    return {
        "case_count": len(results),
        "expected_case_count": expected_cases,
        "pass_count": counts["PASS"],
        "pass_with_review_count": counts["PASS_WITH_REVIEW"],
        "functional_pass_count": (
            counts["PASS"] + counts["PASS_WITH_REVIEW"]
        ),
        "fail_count": counts["FAIL"],
        "observe_count": counts["OBSERVE"],
        "error_count": counts["ERROR"],
        "all_expected_cases_pass": (
            expected_cases > 0
            and counts["FAIL"] == 0
            and counts["ERROR"] == 0
        ),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _html_value(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "✓" if value else "✗"
    return html.escape(str(value))


def _write_html(
    results: list[CorpusResult],
    summary: dict[str, Any],
    path: Path,
) -> None:
    rows = []
    for result in results:
        css = result.verdict.lower()
        rows.append(
            "<tr class='{css}'>"
            "<td>{case}</td><td>{mode}</td><td>{verdict}</td>"
            "<td>{expected_total}</td><td>{v2_total}</td><td>{legacy_total}</td>"
            "<td>{expected_lines}</td><td>{v2_lines}</td><td>{legacy_lines}</td>"
            "<td>{expected_qty}</td><td>{v2_qty}</td><td>{legacy_qty}</td>"
            "<td>{gap}</td><td>{quality}</td>"
            "<td>{review}</td><td>{error}</td>"
            "</tr>".format(
                css=css,
                case=_html_value(result.case_id),
                mode=_html_value(result.mode),
                verdict=_html_value(result.verdict),
                expected_total=_html_value(result.expected_total),
                v2_total=_html_value(result.v2_total),
                legacy_total=_html_value(result.legacy_total),
                expected_lines=_html_value(result.expected_product_lines),
                v2_lines=_html_value(result.v2_product_lines),
                legacy_lines=_html_value(result.legacy_product_lines),
                expected_qty=_html_value(result.expected_quantity),
                v2_qty=_html_value(result.v2_quantity),
                legacy_qty=_html_value(result.legacy_quantity),
                gap=_html_value(result.v2_total_gap),
                quality=_html_value(result.quality_status),
                review=_html_value(result.review_reasons),
                error=_html_value(result.error),
            )
        )

    document = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Corpus V2 BudgetKazPei</title>
<style>
body{{font-family:Arial,sans-serif;margin:24px;color:#17324d}}
h1{{margin-bottom:6px}}
.cards{{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}}
.card{{border:1px solid #ccd8e2;border-radius:10px;padding:12px 18px;min-width:120px}}
table{{border-collapse:collapse;width:100%;font-size:13px}}
th,td{{border:1px solid #d6dee5;padding:7px;text-align:left}}
th{{background:#0f766e;color:white;position:sticky;top:0}}
tr.pass{{background:#e9f8ef}}
tr.pass_with_review{{background:#fff8d9}}
tr.fail{{background:#fff0e8}}
tr.error{{background:#fde7e7}}
tr.observe{{background:#f6f7f8}}
.small{{color:#607286;font-size:13px}}
</style>
</head>
<body>
<h1>Corpus de régression — Parseur V2</h1>
<p class="small">Mode ombre : aucune donnée envoyée à l'application ou à Supabase.</p>
<div class="cards">
<div class="card"><strong>{summary['case_count']}</strong><br>cas analysés</div>
<div class="card"><strong>{summary['pass_count']}</strong><br>réussites automatiques</div>
<div class="card"><strong>{summary['pass_with_review_count']}</strong><br>réussites avec confirmation</div>
<div class="card"><strong>{summary['fail_count']}</strong><br>échecs</div>
<div class="card"><strong>{summary['observe_count']}</strong><br>à documenter</div>
<div class="card"><strong>{summary['error_count']}</strong><br>erreurs techniques</div>
</div>
<table>
<thead><tr>
<th>Ticket</th><th>Mode</th><th>Verdict</th>
<th>Total attendu</th><th>Total V2</th><th>Total ancien</th>
<th>Lignes attendues</th><th>Lignes V2</th><th>Lignes ancien</th>
<th>Quantité attendue</th><th>Quantité V2</th><th>Quantité ancien</th>
<th>Écart V2</th><th>Qualité</th><th>Confirmation</th><th>Erreur</th>
</tr></thead>
<tbody>{''.join(rows)}</tbody>
</table>
</body></html>"""
    path.write_text(document, encoding="utf-8")


def write_report(
    results: list[CorpusResult],
    output_root: str | Path,
) -> dict[str, Any]:
    root = Path(output_root)
    root.mkdir(parents=True, exist_ok=True)
    summary = _summary(results)

    (root / "corpus_results.json").write_text(
        json.dumps(
            {
                "summary": summary,
                "results": [item.to_dict() for item in results],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    _write_csv(results, root / "corpus_results.csv")
    _write_html(results, summary, root / "corpus_report.html")

    lines = [
        "BUDGETKAZPEI — CORPUS V2",
        "=" * 32,
        f"Cas analysés : {summary['case_count']}",
        f"PASS : {summary['pass_count']}",
        (
            "PASS_WITH_REVIEW : "
            f"{summary['pass_with_review_count']}"
        ),
        f"FAIL : {summary['fail_count']}",
        f"OBSERVE : {summary['observe_count']}",
        f"ERROR : {summary['error_count']}",
        "",
    ]
    for result in results:
        lines.append(
            f"{result.verdict:7} | {result.case_id:24} | "
            f"V2 total={result.v2_total} | "
            f"lignes={result.v2_product_lines} | q={result.v2_quantity}"
        )
        if result.error:
            lines.append(f"          erreur: {result.error}")
    (root / "summary.txt").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )
    return summary


def run_manifest(
    manifest_path: str | Path,
    output_root: str | Path,
) -> tuple[list[CorpusResult], dict[str, Any]]:
    manifest = Path(manifest_path).resolve()
    cases = [case for case in load_manifest(manifest) if case.enabled]
    if not cases:
        raise ValueError("Aucun cas activé dans le manifeste.")

    root = Path(output_root).resolve()
    results = [
        run_case(
            case,
            manifest_dir=manifest.parent,
            output_root=root,
        )
        for case in cases
    ]
    return results, write_report(results, root)
