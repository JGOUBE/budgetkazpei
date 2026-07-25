BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 9
================================================

ANALYSE DU CORPUS RÉEL
----------------------
Le ZIP du corpus confirme :

Ticket 39,30 EUR :
- total V2 : 39,30 EUR ;
- somme des articles : 39,30 EUR ;
- 11 lignes produits ;
- quantité : 11.
Son seul écart restant est la date : OCR lit 05/07/2026 alors que la photo
montre 06/07/2026. Ce n'est plus un échec du parseur articles/total.

Ticket 27,22 EUR :
- somme des articles : 27,22 EUR ;
- 14 lignes produits ;
- quantité : 14 ;
- toutes les remises sont correctement rattachées.
Le total cible restait absent parce que la reconstruction OCR produisait :
27,22 EUR
TOTAL.:
27,22 EUR
CARTE BLEUE

CORRECTION GÉNÉRIQUE
--------------------
Les variantes ponctuées d'un libellé TOTAL sont normalisées :
- TOTAL.:
- TOTAL :
- TOTAL.-
- TOTAL (24) ARTICLES

Aucun format d'enseigne n'est codé en dur.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase9_total_ponctuation*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 9 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

TESTS
-----
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Résultat attendu :
Ran 19 tests
OK

CORPUS
------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Résultat fonctionnel attendu :
- ticket 27,22 EUR : total, articles et quantité exacts ;
- ticket 39,30 EUR : total, articles et quantité exacts, date encore à revoir.

Le V2 reste en mode ombre. Aucun déploiement Cloud Run.
