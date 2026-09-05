# Prochaines intégrations retail

## A. État actuel des promotions retail

Le pipeline publié distingue deux bases de date :

- `official` pour Carrefour et toute offre disposant d'une vraie période ; `starts_at`, `ends_at` et, lorsque pertinent, `catalog_id` restent obligatoires ;
- `observed_freshness` uniquement pour Leader Price Réunion via `leader_drive_html`. Aucune date commerciale n'est créée : `observed_at` et `fresh_until` portent une fenêtre technique de 36 heures.

La fonction SQL `retail_observed_freshness_window()` est l'autorité sur cette fenêtre. La projection `published_retail_promotions` ne publie que les offres prouvées, avec preuve présente, prix cohérents, validation vide, identité produit résolue et absence de conflit de matching. Elle filtre les offres expirées ou stale au moment de chaque lecture. Une contrainte partielle et un verrou transactionnel garantissent au plus une offre `observed_freshness` active par `(retailer, produit, magasin)` ; les anciennes lignes sont désactivées mais conservées pour l'historique.

`retailPromotionService.js` fournit le `RetailPromotionViewModel`, le nettoyage des libellés internes et le formatage français des prix. `GoodDealsPage` consomme désormais des données préparées par ce service et ne connaît plus les détails de publication retail.

Le collecteur `services/promo-products-collector` propose des modes CLI readonly, import et incrémentaux pour Leader Price, Carrefour et E.Leclerc. Le dry-run est le défaut. Aucun scheduler propre à ce collecteur n'est versionné dans le dépôt actuel ; l'exploitation doit donc documenter séparément le job réellement déclenché.

## B. Branchement Courses intelligentes

`ShoppingListPage` charge les promotions actives par une seule lecture de `published_retail_promotions`. Si cette vue n'existe pas encore sur un environnement ancien, le service retourne une liste vide et la Liste de courses conserve intégralement son fonctionnement historique. Les identités `market_product` déjà validées sur les articles de tickets sont elles aussi chargées en une requête groupée par reçus, sans requête par ligne.

Aucune migration supplémentaire n'est nécessaire pour ce branchement. Les promotions réelles apparaissent dès que la migration de consolidation `20260904220000_consolidate_retail_promotion_domain.sql`, qui crée la projection publique, est appliquée ; le frontend peut néanmoins être déployé avant elle sans casser l'ancien schéma.

Le contrat `findActivePromotionsForShoppingItems(shoppingItems, promotions)` retourne pour chaque article :

```text
shoppingItem
matchedProductId
promotions[]
bestPromotion
possibleSaving
reliableSaving
confidence
needsReview[]
```

L'ordre de preuve d'identité est : identifiant `shopping_product`, identifiant `market_product`, code-barres, alias explicitement validé, puis nom normalisé uniquement s'il provient des deux côtés d'une normalisation contrôlée. Une contradiction d'identifiant interdit tout repli textuel. Le fuzzy produit au maximum l'état `suggested` et ne devient jamais une économie fiable.

Les prix restent séparés : `historicalPrice`, `promotionPrice`, `possibleSaving`, `reliableSaving`. Une économie fiable exige une identité fiable et un format compatible. Deux tailles d'une même famille ne sont comparées que si les deux prix unitaires permettent une normalisation ; une famille différente ou un format incomplet passe dans `needsReview`. `ShoppingListPage` affiche le meilleur résultat fiable ou la meilleure suggestion sans exposer les champs techniques du matching.

Le service pur `shoppingPromotionEnrichment.js` conserve l'estimation historique comme référence et calcule :

```text
budget habituel estimé
- somme des reliableSaving sur les articles réellement appariés
= budget courses optimisé estimé
```

Une seule meilleure promotion contribue par ligne ; les alternatives sont conservées dans le modèle sans être cumulées. `possibleSaving` n'est jamais sommé lorsque `reliableSaving` est absent. Une promotion peut rester visible si le prix historique manque, mais aucune économie n'est alors inventée.

Les snapshots enregistrent une photographie informative et limitée des champs affichables de l'offre. Ils restent lisibles lorsque la promotion disparaît ou expire, sans réactiver l'offre comme vérité courante. La navigation « Voir le bon plan » passe par `createAppSectionTarget()`.

TODO documenté : le chemin inverse « Bon plan → Ajouter à ma liste » n'est pas activé. Lorsqu'il sera réalisé, l'insertion directe devra exiger une identité produit fiable et un format connu ; les cas ambigus devront seulement ouvrir la liste avec un nom prérempli.

## C. Prochain chantier Conseiller Budget

Le mode `budget_depenses` dispose aujourd'hui des transactions du mois courant et précédent, des catégories, des tickets récents, des articles de tickets, du profil et des agrégats globaux. Il calcule dépenses, revenus, reste estimé, évolution par catégorie, panier moyen et comparaisons historiques fiables entre magasins.

Avant cette consolidation, `chargesFixes` et `depensesVariables`, pourtant fournis par `App`, étaient perdus avant le payload IA. Les abonnements/charges récurrentes ne sont pas transmis au Conseiller, les dépenses inhabituelles ne sont pas calculées et les promotions retail actuelles ne sont pas reliées aux courses. Le contexte conversationnel conserve surtout le sujet actif, les aides recommandées et six tours en mémoire locale ; il n'est pas un historique financier durable. La qualité des réponses dépend donc encore beaucoup d'une instruction générale lorsque les agrégats nécessaires sont absents.

`buildBudgetAdvisorContext()` prépare désormais le contrat suivant sans inventer de valeurs :

```text
period
income
fixedExpenses
variableExpenses
spendingByCategory
grocerySpend
previousPeriodComparison
availableBalance
recurringCharges
unusualExpenses
shoppingSavings
dataCompleteness
```

Les champs indisponibles restent `null` et `dataCompleteness.missing` les rend explicites. `shoppingSavings` indique actuellement `historical_observations` et `currentPromotionsIntegrated: false`. Le prochain chantier devra charger les charges récurrentes, définir les dépenses inhabituelles, brancher uniquement les économies promotionnelles fiables, puis adapter les réponses conversationnelles. Cette étape n'est pas activée ici.

Les futurs handoffs doivent passer par `createAppSectionTarget()` et `requestAppSectionNavigation()` dans `appSectionNavigation.js`, avec une section canonique (`shopping`, `goodDeals`, `conseiller`), l'onglet éventuel et un contexte sérialisable. Aucun composant ne doit construire directement un nouvel alias ou un événement de navigation ad hoc.
