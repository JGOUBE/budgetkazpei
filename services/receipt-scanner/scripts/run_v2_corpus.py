from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path
from tkinter import Tk, filedialog

from receipt_scanner.v2.corpus import (
    discover_images,
    run_manifest,
    write_discovered_manifest,
)


def choose_folder() -> Path:
    ui = Tk()
    ui.withdraw()
    ui.attributes("-topmost", True)
    selected = filedialog.askdirectory(
        title="Choisir le dossier contenant les photos de tickets"
    )
    ui.destroy()
    if not selected:
        raise SystemExit("Sélection annulée.")
    return Path(selected)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Analyse en lot les tickets du corpus avec le parseur V2 "
            "en mode ombre."
        )
    )
    parser.add_argument(
        "--manifest",
        help="Manifeste CSV. Permet les tickets simples et longs.",
    )
    parser.add_argument(
        "--folder",
        help=(
            "Dossier à inventorier. Les images sont ajoutées dans un manifeste "
            "à compléter puis analysées individuellement."
        ),
    )
    parser.add_argument(
        "--output-root",
        help="Dossier de sortie. Par défaut dans Téléchargements.",
    )
    parser.add_argument(
        "--inventory-only",
        action="store_true",
        help="Crée seulement le manifeste découvert, sans lancer l'OCR.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_root = (
        Path(args.output_root)
        if args.output_root
        else Path.home()
        / "Downloads"
        / f"BudgetKazPei_corpus_v2_{stamp}"
    )
    output_root.mkdir(parents=True, exist_ok=True)

    manifest: Path
    if args.manifest:
        manifest = Path(args.manifest).resolve()
    else:
        folder = Path(args.folder).resolve() if args.folder else choose_folder()
        images = discover_images(folder)
        if not images:
            raise SystemExit("Aucune image de ticket trouvée dans ce dossier.")
        manifest = write_discovered_manifest(
            images,
            output_root / "manifest_decouvert.csv",
        )
        print(f"{len(images)} image(s) inventoriée(s).")
        print("Manifeste :", manifest)
        if args.inventory_only:
            return 0

    print("\nAnalyse du corpus avec le V2 en mode ombre...")
    results, summary = run_manifest(manifest, output_root)
    print("\n=== RÉSUMÉ CORPUS V2 ===")
    print("Cas :", summary["case_count"])
    print("PASS :", summary["pass_count"])
    print(
        "PASS_WITH_REVIEW :",
        summary["pass_with_review_count"],
    )
    print("FAIL :", summary["fail_count"])
    print("OBSERVE :", summary["observe_count"])
    print("ERROR :", summary["error_count"])
    print("\nRapport HTML :", output_root / "corpus_report.html")
    print("Rapport CSV  :", output_root / "corpus_results.csv")
    print("Dossier      :", output_root)
    print("\nAucune donnée n'a été envoyée à BudgetKazPei ou à Supabase.")

    archive = shutil.make_archive(
        str(output_root),
        "zip",
        root_dir=output_root,
    )
    print("Archive      :", archive)
    return 0 if summary["error_count"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
