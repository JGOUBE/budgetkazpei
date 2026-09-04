# Prochaines intégrations retail

## A. État actuel des promotions retail

Le pipeline publié distingue deux bases de date :

- `official` pour Carrefour et toute offre disposant d'une vraie période ; `starts_at`, `ends_at` et, lorsque pertinent, `catalog_id` restent obligatoires ;
- `observed_freshness` uniquement pour Leader Price Réunion via `leader_drive_html`. Aucune date commerciale n'est créée : `observed_at` et `fresh_until` portent une fenêtre technique de 36 heures.

La fonction SQL `retail_observed_freshness_window()` est l'autorité sur cette fenêtre. La projection `published_retail_promotions` ne publie que les offres prouvées, avec preuve présente, prix cohérents, validation vide, identité produit résolue et absence de conflit de matching. Elle filtre les offres expirées ou stale au moment de chaque lecture. Une contrainte partielle et un verrou transactionnel garantissent au plus une offre `observed_freshness` active par `(retailer, produit, magasin)` ; les anciennes lignes sont désactivées mais conservées pour l'historique.

`retailPromotionService.js` fournit le `RetailPromotionViewModel`, le nettoyage des libellés internes et le formatage français des prix. `GoodDealsPage` consomme désormais des données préparées par ce service et ne connaît plus les détails de publication retail.

Le collecteur `services/promo-products-collector` propose des modes CLI readonly, import et incrémentaux pour Leader Price, Carrefour et E.Leclerc. Le dry-run est le défaut. Aucun scheduler propre à ce collecteur n'est versionné dans le dépôt actuel ; l'exploitation doit donc documenter séparément le job réellement déclenché.

## B. Prochain branchement Courses intelligentes

Le contrat préparé est `findActivePromotionsForShoppingItems(shoppingItems, promotions)`. Pour chaque article, il retourne :

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

L'ordre de preuve d'identité est : identifiant `shopping_product`, identifiant `market_product`, code-barres, alias explicitement validé, puis nom normalisé uniquement s'il provient des deux côtés d'une normalisation contrôlée. Aucun fuzzy match ne devient automatiquement une vérité.

Les prix restent séparés : `historicalPrice`, `currentPromotionPrice`, `possibleSaving`, `reliableSaving`. Une économie fiable exige une identité fiable et un format compatible. Deux tailles d'une même famille ne sont comparées que si les deux prix unitaires permettent une normalisation ; une famille différente ou un format incomplet passe dans `needsReview`. Ce service n'est pas encore branché à `ShoppingListPage` et n'ajoute aucune promotion à la liste.

Le calcul futur pourra donc être construit sans modifier l'estimation actuelle :

```text
budget habituel estimé
- somme des reliableSaving sur les articles réellement appariés
= budget courses optimisé estimé
```

Il faudra dédupliquer les économies par article et quantité demandée, et ne jamais sommer `possibleSaving` quand `reliableSaving` est absent.

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
