#!/usr/bin/env bash
# BudgetKazPei / Artifact Registry: AUDIT STRICTEMENT EN LECTURE SEULE.
# Compatible Google Cloud Shell (bash + gcloud + Python 3).
# Ne lance aucun job Cloud Run. Ne supprime aucune image.
set -euo pipefail

PROJECT="${1:-budgetkazpei}"
if [[ "$PROJECT" != "budgetkazpei" ]]; then
  echo "Projet refuse: attendu budgetkazpei, recu: $PROJECT" >&2
  exit 2
fi
command -v gcloud >/dev/null || { echo "gcloud introuvable" >&2; exit 2; }
command -v python3 >/dev/null || { echo "python3 introuvable" >&2; exit 2; }

echo "=== AUDIT READ-ONLY DU PROJET: $PROJECT ==="
echo "Cette commande ne fait que LISTER les ressources. Aucune suppression."
echo
echo "1) Depots Artifact Registry (toutes regions):"
gcloud artifacts repositories list --project="$PROJECT" --location=all \
  --format="table(name,format,description)" || {
    echo "Impossible de lister les depots. Aucun changement effectue." >&2
    exit 1
  }

echo
echo "2) Images Docker et versions (sans recuperer le contenu des images):"
repo_json=$(gcloud artifacts repositories list \
  --project="$PROJECT" --location=all --format=json)

repo_paths=$(printf '%s' "$repo_json" | python3 -c '
import json,sys
for item in json.load(sys.stdin):
    if str(item.get("format", "")).upper() != "DOCKER":
        continue
    name = item.get("name", "")
    if "/locations/" not in name or "/repositories/" not in name:
        continue
    location = name.split("/locations/", 1)[1].split("/", 1)[0]
    repository = name.split("/repositories/", 1)[1].split("/", 1)[0]
    print(f"{location}-docker.pkg.dev/budgetkazpei/{repository}")
')
if [[ -z "$repo_paths" ]]; then
  echo "Aucun depot Docker detecte (ou pas de droits de lecture)."
else
  while IFS= read -r repository_path; do
    [[ -z "$repository_path" ]] && continue
    echo
    echo "Depot : $repository_path"
    gcloud artifacts docker images list "$repository_path" --include-tags \
      --project="$PROJECT" \
      --format="table(package,version,createTime,updateTime,tags)" \
    || echo "Echec de lecture pour ce depot (aucune modification)."
  done <<< "$repo_paths"
fi

echo
echo "3) Services Cloud Run actifs : noms et regions seulement"
gcloud run services list --project="$PROJECT" --platform=managed \
  --format="table(name,region)" \
  || echo "Liste des services inaccessible (aucune modification)."

echo
echo "4) Jobs Cloud Run : noms et regions seulement"
gcloud run jobs list --project="$PROJECT" \
  --format="table(name,region)" \
  || echo "Liste des jobs inaccessible (aucune modification)."

echo
echo "AUDIT TERMINE. Ne supprimer aucune image avant de recouper les"
echo "references actives du scanner et des jobs avec les digests du depot."
