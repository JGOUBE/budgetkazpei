BUDGETKAZPEI — CORRECTIF SUPER U V1
=====================================

Ce correctif est isolé au format des tickets Super U / Hyper U / U Express.
Le parseur générique Leader Price, E.Leclerc et autres enseignes reste inchangé.

Corrections incluses
--------------------
- Super U reconnu avec l'espace : « Super U ».
- Lieu reconnu : « Piton Saint-Leu ».
- Total final retenu : 69,48 €.
- « Dont articles éligibles TR : 57,85 € » exclu du total.
- Sous-total, TVA, espèces, rendu et tableau de TVA exclus des articles.
- 20 lignes de produits reconstruites.
- 24 articles comptabilisés.
- Quantités décalées reconnues, notamment 4 × 1,19 € et 2 × 2,55 €.
- Prix décalé vers la ligne suivante reconnu.
- Lignes répétées dans le chevauchement ignorées.
- Une date absente reste vide : la date du jour n'est plus inventée.

Installation
------------
Depuis la racine du projet :

powershell -NoProfile -Command "Expand-Archive -Path '%USERPROFILE%\Downloads\BudgetKazPei_correctif_Super_U_v1.zip' -DestinationPath '.' -Force"

Tests Python
------------
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner
set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_receipt_parser_fr tests.test_quality_gate tests.test_super_u_parser -v

Le résultat attendu se termine par :
OK

Build du frontend
-----------------
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei
npm.cmd run build

Test réel conseillé
-------------------
1. Relancer le serveur Python local.
2. Scanner les deux photos Super U.
3. Vérifier avant tout enregistrement :
   - Super U
   - Piton Saint-Leu
   - date vide si elle n'est pas imprimée/lue
   - total 69,48 €
   - 20 lignes
   - quantité totale 24
   - somme des lignes 69,48 €
4. Refaire ensuite un ticket Leader Price court pour vérifier l'absence de régression.

Ne déployez pas sur Cloud Run avant la réussite des tests locaux.
