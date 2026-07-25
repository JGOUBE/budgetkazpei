from __future__ import annotations

import csv
import shutil
from pathlib import Path


MANIFEST_PATH = Path("corpus_v2_external") / "blind_manifest.csv"
BACKUP_PATH = Path("corpus_v2_external") / "blind_manifest_first_pass_blind.csv"

EXPECTED = {
    "BLIND_001_auchan_stalingrad_12_13_webp": {
        "expected_store": "Auchan",
        "expected_date": "2025-08-14",
        "expected_total": "12.13",
        "expected_product_lines": "5",
        "expected_quantity": "5",
        "expected_status": "budget_ok_articles_partial",
        "truth_note": "5 produits visibles; total 12,13 EUR; pas de nombre d'articles imprimé.",
    },
    "BLIND_002_carrefour_contact_st_sauveur_webp": {
        "expected_store": "Carrefour Contact",
        "expected_date": "2025-06-17",
        "expected_total": "21.54",
        "expected_product_lines": "9",
        "expected_quantity": "12",
        "expected_status": "trusted",
        "truth_note": "9 lignes de vente; 12 articles grâce à la ligne 4 x 1,20 EUR.",
    },
    "BLIND_003_fr_auchan_grenoble_2024_10_17": {
        "expected_store": "Auchan",
        "expected_date": "2024-10-17",
        "expected_total": "4.59",
        "expected_product_lines": "2",
        "expected_quantity": "2",
        "expected_status": "budget_ok_articles_partial",
        "truth_note": "2 produits; total prouvé 4,59 EUR; ticket coupé après le début de la TVA.",
    },
    "BLIND_004_fr_carrefour_market_paris_2024_10_28": {
        "expected_store": "Carrefour Market",
        "expected_date": "2024-10-28",
        "expected_total": "12.61",
        "expected_product_lines": "8",
        "expected_quantity": "8",
        "expected_status": "budget_ok_articles_partial",
        "truth_note": "8 lignes et 8 articles; total à payer 12,61 EUR.",
    },
    "BLIND_005_fr_super_u_la_madeleine_2024_01_20": {
        "expected_store": "Super U",
        "expected_date": "2024-01-20",
        "expected_total": "79.07",
        "expected_product_lines": "30",
        "expected_quantity": "40",
        "expected_status": "budget_ok_articles_partial",
        "truth_note": "Le ticket imprime 30 lignes de vente et 40 articles; reste à payer 79,07 EUR.",
    },
    "BLIND_006_re_eleclerc_les_casernes_2026_07_21_8_": {
        "expected_store": "E.Leclerc",
        "expected_date": "2026-07-21",
        "expected_total": "8.20",
        "expected_product_lines": "4",
        "expected_quantity": "4",
        "expected_status": "trusted",
        "truth_note": "Le cuissot à 38,95 EUR est annulé; 4 produits finaux pour 8,20 EUR.",
    },
    "BLIND_007_re_eleclerc_les_casernes_2026_07_24_10": {
        "expected_store": "E.Leclerc",
        "expected_date": "2026-07-24",
        "expected_total": "10.89",
        "expected_product_lines": "4",
        "expected_quantity": "5",
        "expected_status": "trusted",
        "truth_note": "4 lignes; 5 articles grâce aux 2 baguettes; total 10,89 EUR.",
    },
    "BLIND_008_re_eleclerc_les_casernes_2026_07_24_54": {
        "expected_store": "E.Leclerc",
        "expected_date": "2026-07-24",
        "expected_total": "54.87",
        "expected_product_lines": "21",
        "expected_quantity": "21",
        "expected_status": "trusted",
        "truth_note": "Ticket long en 2 photos; 21 lignes et 21 articles; total 54,87 EUR.",
    },
    "BLIND_009_re_eleclerc_les_casernes_2026_07_24_66": {
        "expected_store": "E.Leclerc",
        "expected_date": "2026-07-24",
        "expected_total": "66.19",
        "expected_product_lines": "15",
        "expected_quantity": "15",
        "expected_status": "trusted",
        "truth_note": "Total articles 66,34 EUR; bon immédiat 0,15 EUR; reste à payer 66,19 EUR.",
    },
    "BLIND_010_re_eleclerc_les_casernes_2026_07_24_du": {
        "expected_store": "E.Leclerc",
        "expected_date": "2026-07-24",
        "expected_total": "0.70",
        "expected_product_lines": "1",
        "expected_quantity": "1",
        "expected_status": "budget_ok_articles_partial",
        "truth_note": "Duplicata: une bouteille d'eau; paiement espèces 0,70 EUR.",
    },
    "BLIND_011_re_eleclerc_les_casernes_2026_07_24_du": {
        "expected_store": "E.Leclerc",
        "expected_date": "2026-07-24",
        "expected_total": "190.90",
        "expected_product_lines": "2",
        "expected_quantity": "2",
        "expected_status": "budget_ok_articles_partial",
        "truth_note": "Duplicata: chargeur 22,90 EUR et Samsung A17 168,00 EUR; total 190,90 EUR.",
    },
}

EXPECTED_FIELDS = [
    "expected_store",
    "expected_date",
    "expected_total",
    "expected_product_lines",
    "expected_quantity",
    "expected_status",
]


def main() -> int:
    if not MANIFEST_PATH.is_file():
        print(f"ERREUR : manifeste introuvable : {MANIFEST_PATH.resolve()}")
        print("Lance ce script depuis services\\receipt-scanner.")
        return 1

    with MANIFEST_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    if not rows:
        print("ERREUR : le manifeste est vide.")
        return 1

    missing_columns = [field for field in EXPECTED_FIELDS if field not in fieldnames]
    if missing_columns:
        print("ERREUR : colonnes manquantes :", ", ".join(missing_columns))
        return 1

    actual_ids = {row.get("case_id", "").strip() for row in rows}
    expected_ids = set(EXPECTED)

    missing_cases = sorted(expected_ids - actual_ids)
    unknown_cases = sorted(actual_ids - expected_ids)

    if missing_cases or unknown_cases:
        print("ERREUR : le manifeste ne correspond pas au lot validé.")
        if missing_cases:
            print("Cas attendus absents :")
            for case_id in missing_cases:
                print(" -", case_id)
        if unknown_cases:
            print("Cas inconnus présents :")
            for case_id in unknown_cases:
                print(" -", case_id)
        print("Aucune modification effectuée.")
        return 1

    if not BACKUP_PATH.exists():
        shutil.copy2(MANIFEST_PATH, BACKUP_PATH)
        print(f"Sauvegarde du passage aveugle créée : {BACKUP_PATH}")
    else:
        print(f"Sauvegarde déjà présente, conservée : {BACKUP_PATH}")

    for row in rows:
        case_id = row["case_id"].strip()
        truth = EXPECTED[case_id]
        for field in EXPECTED_FIELDS:
            row[field] = truth[field]

        original_note = (row.get("notes") or "").strip()
        truth_note = truth["truth_note"]
        row["notes"] = (
            f"{original_note} | VERITE TERRAIN APRES PREMIER PASSAGE : {truth_note}"
            if original_note
            else f"VERITE TERRAIN APRES PREMIER PASSAGE : {truth_note}"
        )

    with MANIFEST_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print()
    print("Vérité terrain ajoutée aux 11 cas.")
    print(f"Manifeste mis à jour : {MANIFEST_PATH}")
    print()
    for row in rows:
        print(
            f"{row['case_id']} | "
            f"{row['expected_store']} | {row['expected_date']} | "
            f"{row['expected_total']} EUR | "
            f"lignes={row['expected_product_lines']} | "
            f"quantité={row['expected_quantity']} | "
            f"statut={row['expected_status']}"
        )

    print()
    print("Tu peux maintenant relancer run_v2_corpus.py avec ce manifeste.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
