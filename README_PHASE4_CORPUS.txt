BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 4 CORPUS
=========================================================

OBJECTIF
--------
Passer immédiatement du succès d'un ticket isolé à une mesure globale.

Cette phase ajoute un banc d'essai automatique qui :
- analyse plusieurs tickets en une commande ;
- accepte les tickets simples et les tickets longs en deux photos ;
- compare le V2 à la vérité attendue et à l'ancien moteur ;
- déduplique les images par empreinte SHA-256 ;
- produit un rapport HTML, CSV, JSON et un ZIP ;
- n'enregistre absolument rien dans l'application ou dans Supabase.

Aucun fournisseur externe n'est utilisé.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase4_corpus*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 4 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

TESTS RAPIDES
-------------
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner
set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Résultat attendu :
Ran 11 tests
OK

PREMIER LANCEMENT IMMÉDIAT
--------------------------
Le manifeste fourni contient déjà trois tickets activés :
- Leader Price 17,95 € ;
- Leader Price 9,37 € ;
- Leader Price 4,32 €.

Lancer :

set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Le rapport sera créé dans :
Téléchargements\BudgetKazPei_corpus_v2_YYYYMMDD_HHMMSS

POUR INVENTORIER UN DOSSIER COMPLET
-----------------------------------
Place les photos de tickets dans un même dossier puis lance :

set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py

Une fenêtre demandera le dossier. Toutes les images seront :
- inventoriées dans manifest_decouvert.csv ;
- analysées en mode une photo ;
- affichées dans le rapport comme OBSERVE tant que les valeurs attendues ne
  sont pas renseignées.

TICKETS LONGS
-------------
Dans corpus_v2\manifest.csv :
- mode = long
- image_1 = photo haute
- image_2 = photo basse
- enabled = 1

Le banc utilise le raccord officiel et passe ensuite le document fusionné dans
le V2. Aucun double traitement manuel n'est nécessaire.

IMPORTANT
---------
Le V2 reste en mode ombre. Ne pas déployer cette phase sur Cloud Run.
La prochaine décision dépendra du rapport complet, et non d'un seul ticket.
