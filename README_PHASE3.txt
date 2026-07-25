BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 3
================================================

PROBLÈME RÉEL CORRIGÉ
---------------------
RapidOCR a correctement lu :
- OIGNON ROUGE INDE KG
- le code isolé (1)12679
- 0,070 kg × 1,95 EUR/kg

Le total imprimé 0,14 EUR était trop faible pour être reconnu comme token OCR.
Le V2 ne reliait pas le produit au détail, car le code article se trouvait
entre les deux lignes reconstruites.

CORRECTION GÉNÉRIQUE
--------------------
Le moteur peut maintenant relier :
  description produit -> PLU/barcode isolé -> détail poids/quantité

Il ne traverse jamais :
- un autre produit ;
- un rayon ;
- un prix ;
- un total ;
- une TVA ;
- un paiement ;
- un rendu.

Lorsque le total de la ligne n'est pas lu, le moteur peut calculer le montant
uniquement si le poids et le prix au kilo sont tous deux prouvés :
  0,070 × 1,95 = 0,1365 -> 0,14 EUR

Le solveur doit ensuite confirmer ce montant grâce au total final et au nombre
d'articles. Sur le ticket réel fourni, le résultat vérifié est :
- total final : 17,95 EUR ;
- somme des articles : 17,95 EUR ;
- quantité reconstruite : 9 ;
- nombre imprimé : 9 ;
- oignon : 0,14 EUR ;
- pomme de terre : 1,98 EUR.

Aucune règle propre à Leader Price n'a été ajoutée.

INSTALLATION
------------
Depuis la racine du projet :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase3_poids_code*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 3 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

TESTS
-----
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner
set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation -v

Résultat attendu :
Ran 6 tests
OK

DIAGNOSTIC RÉEL
---------------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\diagnose_v2_ticket.py

Résultat attendu pour le ticket à 17,95 EUR :
Total V2 : 17.95
Somme articles V2 : 17.95
Lignes produits V2 : 9
Quantité V2 : 9
Raisons V2 : exact_total_match + exact_declared_count_match

MODE OMBRE
----------
Cette phase ne change toujours pas la réponse envoyée à l'application et ne
doit pas encore être déployée sur Cloud Run.
