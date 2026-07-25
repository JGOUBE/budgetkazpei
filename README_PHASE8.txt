BUDGETKAZPEI — PARSEUR GÉNÉRIQUE V2 — PHASE 8
================================================

CAUSE RACINE TROUVÉE
--------------------
La phase 7 contenait une expression régulière doublement échappée.
Conséquence : "-0,18 EUR" n'était jamais reconnu comme un montant négatif.

Le moteur pouvait alors :
- utiliser 0,18 EUR comme prix d'article ;
- associer un libellé de remise au prix du produit suivant ;
- dépasser le nombre d'articles ;
- perdre la cohérence du total.

CORRECTIONS GÉNÉRIQUES
----------------------
1. Correction réelle de la détection des signes -, − et –.
2. Une courte ligne comportant un pourcentage sans code article devient un
   contexte de remise et non un produit.
3. Si OCR perd uniquement le signe moins, un montant positif peut être traité
   comme remise seulement lorsqu'une ligne de pourcentage/remise immédiatement
   précédente en apporte la preuve.
4. Un paiement par carte peut servir de total de secours lorsque la ligne TOTAL
   est perdue. Ce mécanisme n'est pas appliqué aux espèces.

Aucun nom d'enseigne, de rayon, de jour ou de promotion n'est codé en dur.

INSTALLATION
------------
Depuis la racine budgetkazpei :

powershell -NoProfile -Command "$zip=Get-ChildItem \"$env:USERPROFILE\Downloads\" -Filter 'BudgetKazPei_parseur_generique_v2_phase8_remises_regex*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $zip){throw 'Phase 8 introuvable dans Téléchargements'}; Expand-Archive -LiteralPath $zip.FullName -DestinationPath 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei' -Force"

TESTS
-----
cd /d C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\services\receipt-scanner

set PYTHONPATH=%CD%\tests&& .venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation tests.test_v2_corpus -v

Résultat attendu :
Ran 18 tests
OK

CORPUS
------
set PYTHONPATH=%CD%&& .venv\Scripts\python.exe scripts\run_v2_corpus.py --manifest corpus_v2\manifest.csv

Le V2 reste en mode ombre. Aucun déploiement Cloud Run à cette étape.
