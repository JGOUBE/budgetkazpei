BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 6
================================================

PROBLÈME IDENTIFIÉ
------------------
La ligne :
BOISSONS SANS ALCOOL  2,86 EUR

restait considérée comme un article. Le détecteur comptait les éléments
monétaires dans la longueur du libellé :
BOISSONS / SANS / ALCOOL / 2 / 86 / EUR

Le libellé dépassait donc artificiellement la limite des lignes courtes.

CORRECTION GÉNÉRIQUE
--------------------
Avant d'évaluer un libellé de groupe, le moteur retire désormais :
- le montant ;
- EUR / EURO / EUROS ;
- les espaces produits par cette suppression.

Ainsi, "BOISSONS SANS ALCOOL 2,86 EUR" est correctement analysé comme un
libellé de trois mots. Son montant est ensuite contrôlé par la cohérence du
groupe précédent et la position dans le ticket.

Aucun nom de rayon ou d'enseigne n'est codé en dur.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase6_libelles_sous_totaux*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 6 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

TESTS
-----
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Résultat attendu :
Ran 13 tests
OK

CORPUS RÉEL
-----------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Objectif :
Cas : 4
PASS : 4
FAIL : 0
ERROR : 0

Le V2 reste en mode ombre.
