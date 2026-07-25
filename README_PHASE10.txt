BUDGETKAZPEI — PARSEUR V2 — PHASE 10
=========================================

OBJECTIF 1 — FIGER date_requires_review
----------------------------------------
Un ticket n'est plus classé FAIL lorsque :
- le magasin est cohérent ;
- le total est exact ;
- les lignes produits sont exactes ;
- la quantité est exacte ;
- seule la date est absente ou différente ;
- le manifeste demande explicitement date_requires_review.

Le résultat devient :
PASS_WITH_REVIEW
budget_ok = true
articles_ok = true
date_confirmed = false

Une erreur de total, de quantité, de produit ou de magasin reste toujours FAIL.

OBJECTIF 2 — TEST SUPER U À L'AVEUGLE
-------------------------------------
Le ticket Super U Piton Saint-Leu est ajouté comme sixième cas :
- deux photos avec chevauchement ;
- total attendu : 69,48 EUR ;
- 20 lignes d'articles ;
- 24 articles ;
- date non visible : date_requires_review.

Aucune règle du parseur n'a été modifiée pour ce ticket avant son premier test.
Il s'agit donc d'une vraie validation inconnue.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase10_date_review_super_u*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 10 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

MISE À JOUR DU MANIFESTE
------------------------
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\update_v2_manifest_phase10.py

TESTS
-----
set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Résultat attendu :
Ran 22 tests
OK

CORPUS
------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Le résumé affiche désormais séparément :
PASS
PASS_WITH_REVIEW
FAIL
OBSERVE
ERROR

Le corpus doit contenir 6 cas. Super U doit être observé sans adaptation du
parseur. Le V2 reste en mode ombre et ne doit pas être déployé sur Cloud Run.
