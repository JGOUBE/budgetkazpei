BUDGETKAZPEI — PARSEUR GENERIQUE V2 — PHASE 2

Correctifs generiques inclus :
- un numero de telephone ne peut plus devenir un prix ;
- les lignes de detail poids/quantite ne deviennent plus des produits ;
- poids et prix/kg reconnus meme lorsque l OCR coupe la ligne ;
- les sous-totaux de groupes sont detectes par addition des produits precedents, sans liste de rayons ;
- TOTAL et montant peuvent etre reconstruits sur deux lignes OCR ;
- le nombre d articles imprime pese davantage dans le solveur.

Installation depuis la racine :
powershell -NoProfile -Command "Expand-Archive -Path '%USERPROFILE%\Downloads\BudgetKazPei_parseur_generique_v2_phase2_generic.zip' -DestinationPath '.' -Force"

Tests :
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner
set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation -v

Ne pas deployer sur Cloud Run. Refaire ensuite le diagnostic reel a 17,95 EUR.
