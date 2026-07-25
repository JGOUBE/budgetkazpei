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

SUPER_U_CASE = {
    "case_id": "SUPER_U_PITON_SAINT_LEU_69_48",
    "enabled": "1",
    "mode": "long",
    "image_1": "images/super_u_piton_saint_leu_69_48_haut.jpg",
    "image_2": "images/super_u_piton_saint_leu_69_48_bas.jpg",
    "expected_store": "Super U",
    "expected_date": "",
    "expected_total": "69.48",
    "expected_product_lines": "20",
    "expected_quantity": "24",
    "expected_status": "date_requires_review",
    "notes": (
        "Validation inconnue : premier passage V2 sans adaptation. "
        "Deux photos, 20 lignes, 24 articles, date non visible."
    ),
}


def normalized(row: dict[str, str]) -> dict[str, str]:
    return {
        header: row.get(header, "")
        for header in HEADERS
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
            rows = [
                normalized(row)
                for row in csv.DictReader(handle)
            ]

    # Freeze the already validated 39.30 EUR ticket:
    # core scan passes, only the date needs confirmation.
    for row in rows:
        if row.get("case_id") == "LP_SAINT_LEU_39_30":
            row["expected_status"] = "date_requires_review"
            row["notes"] = (
                "Total, articles et quantité validés. "
                "Date OCR à confirmer manuellement."
            )

    replaced = False
    for index, row in enumerate(rows):
        if row.get("case_id") == SUPER_U_CASE["case_id"]:
            rows[index] = dict(SUPER_U_CASE)
            replaced = True
            break

    if not replaced:
        rows.append(dict(SUPER_U_CASE))

    manifest.parent.mkdir(parents=True, exist_ok=True)
    with manifest.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)

    print("Manifeste mis à jour :", manifest)
    print("Statut figé : LP_SAINT_LEU_39_30 = date_requires_review")
    print("Cas ajouté : SUPER_U_PITON_SAINT_LEU_69_48")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
