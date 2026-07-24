from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from tkinter import Tk, filedialog, messagebox

from receipt_scanner.column_detector import ColumnDetector
from receipt_scanner.image_preprocessor import ImagePreprocessor
from receipt_scanner.line_reconstructor import (
    LineReconstructor,
    save_reconstructed_lines,
)
from receipt_scanner.ocr_engine import RapidOCREngine
from receipt_scanner.receipt_parser_fr import ReceiptParserFR
from receipt_scanner.v2 import GenericReceiptParserV2


def choose_image() -> Path:
    ui = Tk()
    ui.withdraw()
    ui.attributes("-topmost", True)
    selected = filedialog.askopenfilename(
        title="Choisir un ticket pour le diagnostic V2",
        filetypes=[
            ("Images", "*.jpg *.jpeg *.png *.webp"),
            ("Tous les fichiers", "*.*"),
        ],
    )
    if not selected:
        raise SystemExit("Sélection annulée.")
    return Path(selected)


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else choose_image()
    if not source.is_file():
        raise FileNotFoundError(source)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = (
        Path.home()
        / "Downloads"
        / f"BudgetKazPei_v2_shadow_{stamp}"
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    preprocessed = output_dir / "preprocessed.jpg"
    preprocessing = ImagePreprocessor(max_side=1600).process(
        source,
        preprocessed,
    )
    document = RapidOCREngine(use_cls=False).analyze(preprocessed)
    lines = LineReconstructor().reconstruct(document)
    if document.tokens:
        ColumnDetector().assign_columns(document, lines)

    document.save_json(output_dir / "ocr_document.json")
    save_reconstructed_lines(
        document,
        lines,
        output_dir / "reconstructed_lines.json",
    )

    legacy = ReceiptParserFR().parse(document, lines)
    legacy.save_json(output_dir / "legacy_receipt.json")

    v2 = GenericReceiptParserV2().analyze(
        document,
        lines,
        legacy_receipt=legacy,
    )
    (output_dir / "v2_shadow_result.json").write_text(
        json.dumps(v2, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "preprocessing.json").write_text(
        json.dumps(
            preprocessing.to_dict(),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    selected = v2["selected_hypothesis"]
    target = selected.get("target_total") or {}
    comparison = v2.get("comparison") or {}

    print("\n=== PARSEUR V2 EN MODE OMBRE ===")
    print("Image :", source)
    print("Rotation :", preprocessing.rotation_degrees)
    print("Lignes OCR :", len(lines))
    print("Candidats articles :", v2["candidate_count"])
    print("Candidats total :", v2["total_candidate_count"])
    print("Total V2 :", target.get("amount"))
    print("Somme articles V2 :", selected.get("items_total"))
    print("Lignes produits V2 :", len(selected.get("items", [])))
    print("Quantité V2 :", selected.get("counted_quantity"))
    print("Nombre imprimé :", selected.get("declared_count"))
    print("Raisons V2 :", selected.get("reasons"))
    print("\nComparaison moteur actuel :")
    print(json.dumps(comparison, ensure_ascii=False, indent=2))

    print("\nArticles V2 retenus :")
    for index, item in enumerate(selected.get("items", []), start=1):
        print(
            f"{index:02d}. {item['raw_name']} | "
            f"q={item['quantity']} | pu={item['unit_price']} | "
            f"total={item['total_price']} | lignes={item['source_line_ids']}"
        )

    zip_path = Path(
        shutil.make_archive(
            str(output_dir),
            "zip",
            root_dir=output_dir,
        )
    )
    print("\nDiagnostic créé :", zip_path)
    print("Aucun résultat V2 n'a été envoyé à l'application ou à la base.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
