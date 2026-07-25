BUDGETKAZPEI — PHASE 12 — CORPUS EXTERNES
================================================

Cette phase ne modifie pas le parseur.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase12_corpus_externes*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 12 introuvable'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

VÉRIFIER LE SOCLE FIGÉ
----------------------
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\check_v2_frozen_baseline.py

Résultat attendu :
BASELINE V2 RESPECTÉE
4 PASS + 2 PASS_WITH_REVIEW + 0 FAIL + 0 ERROR

PRÉPARER UN NOUVEAU LOT AVEUGLE
-------------------------------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\prepare_v2_external_corpus.py

Puis lancer :
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2_external\blind_manifest.csv

Les résultats doivent rester OBSERVE jusqu'à saisie de la vérité terrain.
