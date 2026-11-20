# BudgetKazPeï — recette Conseiller Premium FR / KR
Date de préparation : 20 novembre 2026.

## Contexte et protections à préserver
- Branche : `feat/advisor-intelligence-fr-kreol-20261120`.
- Fonction actuelle de production inchangée tant que la recette Premium réelle n'est pas validée.
- Ne pas contourner l'authentification, les droits d'abonnement, les réservations atomiques `reserve_advisor_ai_request` et `reserve_advisor_openai`, ni le règlement des coûts.
- Chaque réponse générative normale : **un seul** appel OpenAI. Les salutations, réponses budgétaires locales et liens d'aides déjà connus : **zéro** appel OpenAI.
- Quotas serveur hors sujet conservés (5/jour et 20/mois), sans affichage des seuils au public. Tester sans saturer artificiellement les quotas d'un vrai compte.
- Ne jamais injecter des coordonnées personnelles, données de facturation ou de budget dans une question sans lien.

## Scénarios réels — utiliser le même compte Premium
| # | Français | Créole réunionnais (interface KR) | Attendu |
|---|---|---|---|
| 1 | Bonjour | Bonzour | Réponse locale, naturelle, zéro appel IA |
| 2 | Pourquoi le ciel est-il bleu ? | Poukoi lo sièl lé blé ? | Explication sur le ciel, pas de renvoi CAF/budget, au plus un appel IA |
| 3 | Imagine un volcan qui parle avec des chats | Imagin in volkan i koz ansanm bann sat | Créativité, pas de montant administratif, au plus un appel IA |
| 4 | Quelles aides existent pour payer mon loyer ? | Kèl bann aides pou péy mon loyé ? | Aides pertinentes, conditions prudentes, sources officielles vérifiables |
| 5 | Et combien ? (après la réponse 4) | Ek kombyin ? | Suit la même aide ; pas de montant non vérifié |
| 6 | Autre sujet : comment fonctionne un volcan ? (après l'aide) | Ot suzé : koman in volkan i mars ? | Abandonne le contexte CAF sans afficher le profil |
| 7 | Où est-ce que je dépense le plus ce mois-ci ? | Dann kèl post mi dépans le pli sa mwa-la ? | Chiffres réellement présents, période affichée, catégorie cohérente |
| 8 | Que puis-je économiser concrètement sur mes courses ? | Kosa mi pé économiz su mon bann courses ? | Conseils fondés sur tickets, liste et prix comparables ; aucune fausse économie |
| 9 | Mon budget a-t-il augmenté par rapport au mois dernier ? | Mon bidzé la ogmanté par rapor mwa passé ? | Distingue mois partiel et mois complet ; signale les données manquantes |
| 10 | Quel est le taux d'inflation actuel à La Réunion ? | Konbien linflasion lé aktiel La Rényon ? | N'invente pas de chiffre « actuel » non vérifié ; indique où vérifier |
| 11 | Je me suis trompé, mon loyer est de 700 et non 900 euros | Mi la tronpé, mon loyé lé 700, pa 900 euro | Prend la correction en compte et ne prétend pas modifier le profil |
| 12 | Quelles démarches pour un recours CAF ? | Koman mi fé in rekour la CAF ? | Étapes adaptées, motif ou délai inconnu explicitement signalé |

## Mesures à noter à chaque scénario
- Bonne compréhension de l'intention, en FR et KR ; suivi du sujet et changement de sujet.
- Réponse immédiatement utile ; maximum trois suggestions pertinentes ; pas de phrase répétée inutile.
- Pour le budget : montants et période conformes au compte, état des données incomplet signalé.
- Pour les aides : source officielle, date/validité des barèmes, aucune promesse d'éligibilité.
- Absence de mélange involontaire de français/créole dans les réponses KR (les noms d'organismes restent officiels).
- Métrologie serveur : `openAiCallCount` égal à 0 ou 1, jamais 2 pour le parcours normal ; logs `ADVISOR_API_METER` sans question ni données privées.
- Les actions de navigation et les cadenas Premium ne régressent pas.

## Publication
1. Rejouer les tests du dépôt (`npm run test:advisor-diverse`, `npm run test:advisor-kreol-parity`, `npm run test:advisor-spend-guard`, `npm run test:advisor-ai-cost`) et le build complet.
2. Tester une version isolée de la fonction du Conseiller avec un compte Premium, pas uniquement le rendu du site. Un preview web seul peut toujours appeler la fonction de production.
3. Vérifier le FR/KR, les réponses et la consommation réelle avant de déployer `assistant-aisupabase` en production.
4. Après publication, contrôler les logs sans contenu personnel et conserver une possibilité de retour arrière.

Ce document est une grille de recette, pas un compte rendu de tests réels.
