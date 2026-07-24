from __future__ import annotations
import argparse, csv, hashlib, json, re, shutil
from datetime import datetime
from pathlib import Path
from tkinter import Tk, filedialog

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
GENERATED = ("preprocessed", "merged_preprocessed", "debug", "annotated", "overlay", "crop")
TOP = ("haut", "top", "partie_1", "part1", "photo_1", "photo1")
BOTTOM = ("bas", "bottom", "partie_2", "part2", "photo_2", "photo2")
HEADERS = ["case_id","enabled","mode","image_1","image_2","expected_store","expected_date","expected_total","expected_product_lines","expected_quantity","expected_status","notes"]

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source-folder")
    p.add_argument("--target-root")
    return p.parse_args()

def choose():
    ui = Tk(); ui.withdraw(); ui.attributes("-topmost", True)
    selected = filedialog.askdirectory(title="Choisir le dossier de nouveaux tickets")
    ui.destroy()
    if not selected:
        raise SystemExit("Sélection annulée.")
    return Path(selected)

def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_") or "ticket"

def side_key(stem):
    s = slug(stem)
    for marker in TOP:
        token = slug(marker)
        if token in s:
            return s.replace(token, "").strip("_"), "top"
    for marker in BOTTOM:
        token = slug(marker)
        if token in s:
            return s.replace(token, "").strip("_"), "bottom"
    return s, "single"

def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    a = parse_args()
    source = Path(a.source_folder).resolve() if a.source_folder else choose().resolve()
    scanner_root = Path(__file__).resolve().parents[1]
    target = Path(a.target_root).resolve() if a.target_root else scanner_root / "corpus_v2_external"
    images_dir = target / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    images = [
        p.resolve() for p in sorted(source.rglob("*"))
        if p.is_file()
        and p.suffix.lower() in EXTENSIONS
        and not any(m in p.name.lower() for m in GENERATED)
    ]
    if not images:
        raise SystemExit("Aucune image trouvée.")

    groups = {}
    for image in images:
        key, side = side_key(image.stem)
        groups.setdefault(key, {"top": [], "bottom": [], "single": []})[side].append(image)

    rows, registry = [], []
    number = 1
    for key, group in sorted(groups.items()):
        if len(group["top"]) == 1 and len(group["bottom"]) == 1 and not group["single"]:
            case_id = f"BLIND_{number:03d}_{slug(key)[:38]}"
            copied = []
            for side, src in (("haut", group["top"][0]), ("bas", group["bottom"][0])):
                dst = images_dir / f"{slug(key)}_{side}_{number:03d}{src.suffix.lower()}"
                shutil.copy2(src, dst); copied.append(dst)
            rows.append({
                "case_id": case_id, "enabled": "1", "mode": "long",
                "image_1": str(copied[0].relative_to(target)),
                "image_2": str(copied[1].relative_to(target)),
                "expected_store": "", "expected_date": "", "expected_total": "",
                "expected_product_lines": "", "expected_quantity": "",
                "expected_status": "",
                "notes": "BLIND: ne pas renseigner avant le premier passage V2.",
            })
            registry.append({"case_id": case_id, "mode": "long", "sha256": [sha256(group["top"][0]), sha256(group["bottom"][0])]})
            number += 1
        else:
            for src in group["single"] + group["top"] + group["bottom"]:
                case_id = f"BLIND_{number:03d}_{slug(src.stem)[:38]}"
                dst = images_dir / f"{slug(src.stem)}_{number:03d}{src.suffix.lower()}"
                shutil.copy2(src, dst)
                rows.append({
                    "case_id": case_id, "enabled": "1", "mode": "single",
                    "image_1": str(dst.relative_to(target)), "image_2": "",
                    "expected_store": "", "expected_date": "", "expected_total": "",
                    "expected_product_lines": "", "expected_quantity": "",
                    "expected_status": "",
                    "notes": "BLIND: ne pas renseigner avant le premier passage V2.",
                })
                registry.append({"case_id": case_id, "mode": "single", "sha256": [sha256(src)]})
                number += 1

    with (target / "blind_manifest.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS); w.writeheader(); w.writerows(rows)
    (target / "blind_registry.json").write_text(
        json.dumps({
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "source_folder": str(source),
            "status": "BLIND_UNSCORED",
            "case_count": len(rows),
            "cases": registry,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("Nouveaux cas :", len(rows))
    print("Manifeste :", target / "blind_manifest.csv")
    print("Ne renseignez rien avant le premier passage V2.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
