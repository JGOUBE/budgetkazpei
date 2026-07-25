BUDGETKAZPEI — CORRECTION PHASE 12B

La référence figée contenait une erreur de saisie :
LP_CILAOS_15_07 était enregistré avec 6 lignes produits.

Le rapport réellement validé retourne :
- total : 15,07 EUR
- lignes produits : 5
- quantité : 7
- verdict : PASS

Cette correction ne modifie pas le moteur V2.
Elle corrige uniquement le fichier de référence anti-régression.

Installation depuis la racine du projet :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_phase12b_correction_baseline_cilaos*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Correctif phase 12B introuvable'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

Puis, depuis services\receipt-scanner :

set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\check_v2_frozen_baseline.py

Résultat attendu :
BASELINE V2 RESPECTÉE
4 PASS + 2 PASS_WITH_REVIEW + 0 FAIL + 0 ERROR
