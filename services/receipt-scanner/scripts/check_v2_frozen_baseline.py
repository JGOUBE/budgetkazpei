from __future__ import annotations
import argparse, json
from pathlib import Path

def args():
    p = argparse.ArgumentParser()
    p.add_argument("--results")
    p.add_argument("--baseline")
    return p.parse_args()

def latest_results():
    files = sorted(
        (Path.home() / "Downloads").glob("BudgetKazPei_corpus_v2_*/corpus_results.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not files:
        raise FileNotFoundError("Aucun corpus_results.json trouvé.")
    return files[0]

def money_ok(a, b):
    return b is not None and abs(float(a) - float(b)) <= 0.01

def main():
    a = args()
    scanner_root = Path(__file__).resolve().parents[1]
    baseline_path = Path(a.baseline).resolve() if a.baseline else scanner_root / "corpus_v2" / "FROZEN_BASELINE_PHASE12.json"
    results_path = Path(a.results).resolve() if a.results else latest_results()
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    report = json.loads(results_path.read_text(encoding="utf-8"))
    rows = {r["case_id"]: r for r in report.get("results", [])}
    errors = []

    for case_id, expected in baseline["cases"].items():
        actual = rows.get(case_id)
        if actual is None:
            errors.append(f"{case_id}: absent")
            continue
        checks = [
            ("verdict", actual.get("verdict") == expected["verdict"]),
            ("v2_total", money_ok(expected["v2_total"], actual.get("v2_total"))),
            ("v2_product_lines", int(actual.get("v2_product_lines", -1)) == expected["v2_product_lines"]),
            ("v2_quantity", int(actual.get("v2_quantity", -1)) == expected["v2_quantity"]),
        ]
        for field, ok in checks:
            if not ok:
                errors.append(f"{case_id}: {field} attendu={expected.get(field)!r} obtenu={actual.get(field)!r}")
        for reason in expected.get("review_reasons", []):
            actual_reasons = {x.strip() for x in str(actual.get("review_reasons") or "").split(",") if x.strip()}
            if reason not in actual_reasons:
                errors.append(f"{case_id}: motif manquant {reason}")

    bad = [r["case_id"] for r in report.get("results", []) if r.get("verdict") in {"FAIL", "ERROR"}]
    if bad:
        errors.append("FAIL/ERROR présents : " + ", ".join(bad))

    print("Référence :", baseline_path)
    print("Rapport   :", results_path)
    if errors:
        print("\nRÉGRESSION DÉTECTÉE")
        for e in errors:
            print(" -", e)
        return 1
    print("\nBASELINE V2 RESPECTÉE")
    print("4 PASS + 2 PASS_WITH_REVIEW + 0 FAIL + 0 ERROR")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
