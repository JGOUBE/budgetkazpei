BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 1
================================================

OBJECTIF
-------
Commencer la refonte sans casser le scanner actuel.

Cette phase ajoute un moteur V2 entièrement indépendant et local :
- aucune API Azure, Google Document AI ou OpenAI ;
- aucun envoi d'image à un tiers ;
- aucune règle liée à une enseigne particulière ;
- aucun changement du résultat envoyé à l'application.

Le V2 fonctionne uniquement en MODE OMBRE :
il analyse le même OCR, génère plusieurs hypothèses, choisit la combinaison
la plus cohérente avec le total et le nombre d'articles, puis écrit un
diagnostic local.

CE QUI EST DÉJÀ IMPLÉMENTÉ
--------------------------
1. Classification générique et multi-étiquettes des lignes :
   produit, rayon, détail, total, sous-total, TVA, paiement, rendu, etc.

2. Génération de plusieurs structures possibles :
   - produit + prix sur la même ligne ;
   - produit puis prix sur la ligne suivante ;
   - prix puis produit légèrement plus bas ;
   - produit + quantité × prix unitaire ;
   - produit + poids × prix/kg ;
   - rayon et produit partageant une ligne.

3. Solveur global :
   - interdit les candidats qui se chevauchent ;
   - récompense le total exact ;
   - récompense le nombre d'articles exact ;
   - pénalise les doubles comptages ;
   - exclut sous-total, TVA, paiement et rendu des totaux finaux.

INSTALLATION
------------
Depuis la racine du projet :

powershell -NoProfile -Command "Expand-Archive -Path '%USERPROFILE%\Downloads\BudgetKazPei_parseur_generique_v2_phase1.zip' -DestinationPath '.' -Force"

TESTS
-----
Depuis :
C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

Lancer sur une seule ligne :

set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation -v

Résultat attendu :
Ran 4 tests
OK

DIAGNOSTIC SUR LE TICKET RÉEL À 17,95 €
----------------------------------------
Toujours depuis services\receipt-scanner :

set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\diagnose_v2_ticket.py

Une fenêtre s'ouvre. Choisir la photo verticale du ticket.
Un ZIP est créé dans Téléchargements :
BudgetKazPei_v2_shadow_YYYYMMDD_HHMMSS.zip

Le script affiche :
- total V2 ;
- somme des articles V2 ;
- lignes produits V2 ;
- quantité V2 ;
- comparaison avec le moteur actuel ;
- articles retenus et lignes sources.

Aucune donnée V2 n'est envoyée à BudgetKazPei ou à Supabase.

IMPORTANT
---------
Ne pas déployer cette phase sur Cloud Run.
Nous devons d'abord exécuter le diagnostic sur plusieurs tickets du corpus,
puis corriger les faiblesses du moteur générique lui-même. Aucune nouvelle
rustine par enseigne ne sera ajoutée.
