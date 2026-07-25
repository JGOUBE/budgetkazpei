BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 5
================================================

CAS RÉEL TRAITÉ
---------------
Le ticket à 39,30 € contenait 11 vrais produits et plusieurs sous-totaux de
groupes. Le V2 obtenait le bon total avec seulement 7 lignes parce qu'il
utilisait notamment :
- EPICERIE SUCREE 10,73 € ;
- SOUS TRAITANCE 8,70 € ;
comme s'il s'agissait d'articles.

L'OCR avait en plus lu 18,73 € comme 10,73 €, ce qui empêchait la seule
vérification arithmétique de reconnaître le premier sous-total.

CORRECTION GÉNÉRIQUE
--------------------
Les sous-totaux sont désormais reconnus grâce à deux preuves indépendantes :

1. preuve arithmétique :
   le montant correspond à la somme du groupe précédent ;

2. preuve de mise en page :
   une courte ligne majuscule sans code article est nettement décalée vers la
   gauche par rapport aux descriptions précédentes et sépare deux groupes.

Aucun nom de rayon ou d'enseigne n'est codé en dur.

Une vraie ligne produit comme :
(1)299991...  BOUCHERIE COUPE  8,78 €
reste un article parce qu'elle possède une preuve de code article.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase5_groupes*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 5 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

TESTS
-----
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Résultat attendu :
Ran 12 tests
OK

CORPUS RÉEL
-----------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Objectif :
Cas : 4
PASS : 4
FAIL : 0
ERROR : 0

Le V2 reste en mode ombre et ne doit pas encore être déployé sur Cloud Run.
