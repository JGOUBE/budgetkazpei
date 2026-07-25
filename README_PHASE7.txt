BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 7
================================================

OBJECTIFS GÉNÉRIQUES
---------------------
Cette phase traite deux structures révélées par des tickets différents :

1. description et prix séparés par OCR :
   PRODUIT + CODE
   1,70 EUR

   Le mot EUR n'est plus considéré comme du texte produit. La seconde ligne
   devient donc une ligne financière rattachable à la description précédente.

2. remise immédiate négative après un produit :
   PRODUIT A       1,30 EUR
   texte quelconque  -0,13 EUR

   Le moteur génère une hypothèse nette à 1,17 EUR sans dépendre des mots
   "promotion", "jeudi", du nom d'une carte ou d'une enseigne. La preuve est
   le montant explicitement négatif placé immédiatement après le produit.

Aucune règle Leader Price, Leclerc ou Super U n'est ajoutée.

NOUVEAU CAS DE CORPUS
---------------------
LP_SAINT_LEU_27_22 :
- deux photos avec chevauchement ;
- total 27,22 EUR ;
- 14 lignes produits ;
- 14 articles ;
- remises négatives après de nombreux produits ;
- plusieurs sous-totaux de groupes.

Les deux photos sont stockées dans le projet sous :
services\receipt-scanner\corpus_v2\images

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase7_continuations_remises*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 7 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

METTRE À JOUR LE MANIFESTE
--------------------------
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\update_v2_manifest_phase7.py

Cette commande ajoute le nouveau cas sans effacer les tickets existants.

TESTS
-----
set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Résultat attendu :
Ran 15 tests
OK

CORPUS RÉEL
-----------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Le corpus contient désormais 5 cas. Les valeurs recherchées sont :
Cas : 5
ERROR : 0

Le ticket à 39,30 EUR doit maintenant retrouver les deux produits dont le prix
était séparé sur la ligne suivante. Le ticket à 27,22 EUR constitue un nouveau
test indépendant de remises négatives et de raccord deux photos.

Le V2 reste en mode ombre et ne doit pas encore être déployé sur Cloud Run.
