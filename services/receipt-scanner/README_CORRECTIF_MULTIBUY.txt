BUDGETKAZPEI — CORRECTIF V2 PHASE 1 — QUANTITÉS MULTIPLES

Cause corrigée
--------------
La ligne « 2 x 3,90 EUR » était interprétée comme un total de ligne à 3,90 €.
Le solveur préférait donc le candidat standard à 7,80 € avec quantité 1.

Le correctif distingue maintenant :
- le prix unitaire présent sur la ligne de détail ;
- le total explicite imprimé à côté du produit ;
- le calcul quantité × prix unitaire.

Installation depuis la racine budgetkazpei
------------------------------------------
powershell -NoProfile -Command "Expand-Archive -Path '%USERPROFILE%\Downloads\BudgetKazPei_parseur_generique_v2_phase1_correctif_multibuy.zip' -DestinationPath '.' -Force"

Puis relancer :
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner
set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation -v

Résultat attendu :
Ran 4 tests
OK
