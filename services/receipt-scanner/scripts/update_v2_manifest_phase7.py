from __future__ import annotations

import csv
from pathlib import Path


HEADERS = [
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

NEW_CASE = {
    "case_id": "LP_SAINT_LEU_27_22",
    "enabled": "1",
    "mode": "long",
    "image_1": "images/lp_saint_leu_27_22_haut.jpg",
    "image_2": "images/lp_saint_leu_27_22_bas.jpg",
    "expected_store": "Leader Price",
    "expected_date": "2026-07-23",
    "expected_total": "27.22",
    "expected_product_lines": "14",
    "expected_quantity": "14",
    "expected_status": "",
    "notes": (
        "Ticket deux photos avec remises négatives immédiates, "
        "sous-totaux de groupes et chevauchement."
    ),
}


def main() -> int:
    scanner_root = Path(__file__).resolve().parents[1]
    manifest = scanner_root / "corpus_v2" / "manifest.csv"

    rows: list[dict[str, str]] = []
    if manifest.exists():
        with manifest.open(
            "r",
            encoding="utf-8-sig",
            newline="",
        ) as handle:
            rows = list(csv.DictReader(handle))

    updated = False
    for index, row in enumerate(rows):
        if row.get("case_id") == NEW_CASE["case_id"]:
            rows[index] = dict(NEW_CASE)
            updated = True
            break

    if not updated:
        rows.append(dict(NEW_CASE))

    manifest.parent.mkdir(parents=True, exist_ok=True)
    with manifest.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADERS)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    header: row.get(header, "")
                    for header in HEADERS
                }
            )

    print("Manifeste mis à jour :", manifest)
    print("Cas ajouté/actualisé :", NEW_CASE["case_id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
