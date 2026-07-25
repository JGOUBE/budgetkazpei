BUDGETKAZPEI — PARSEUR V2 — PHASE 11
=========================================

ANALYSE DU ZIP COMPLET
----------------------
Le ticket Super U n'échoue pas sur une règle d'enseigne.

Trois structures génériques expliquent exactement l'écart :

1. Une ligne "1 x 1,39 EUR" répétait le prix de l'article précédent.
   Le moteur la rattachait à tort au titre de groupe suivant.

2. "BUP CALIN 20%MG 500G NAT" était pris pour une remise parce que le produit
   contient un pourcentage de matière grasse. La présence de 500G prouve qu'il
   s'agit d'une caractéristique produit, pas d'une promotion.

3. La fusion OCR a décalé verticalement les montants :
   - "Nombre de lignes d'article 20" portait 69,48 EUR ;
   - "TOTAL [24] Articles" portait 68,11 EUR ;
   - "SOUS-TOTAL" portait 1,37 EUR.
   Le moteur distingue maintenant le nombre de lignes (20) de la quantité
   d'articles (24) et conserve 69,48 EUR comme candidat de total décalé.

Aucun nom Super U, rayon ou produit n'est codé en dur.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase11_super_u_structure*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 11 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

TESTS
-----
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Le nombre attendu est :
Ran 26 tests
OK

CORPUS
------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Résultat fonctionnel recherché pour Super U :
- total : 69,48 EUR ;
- somme des articles : 69,48 EUR ;
- 20 lignes produits ;
- 24 articles ;
- date_requires_review.

Le V2 reste en mode ombre. Aucun déploiement Cloud Run.
