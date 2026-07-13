# Market anonymise V1

Ce branchement publie uniquement des observations anonymisees vers les tables `market_`.
Les tickets, utilisateurs et lignes de tickets restent hors du schema collectif.

## Secret requis

L'Edge Function `market-record-observations` exige un secret stable :

```bash
supabase secrets set MARKET_HASH_SECRET="SECRET_STABLE_A_DEFINIR"
```

Ce secret ne doit pas etre regenere sans procedure de migration, car il sert a produire les cles anonymes :

- `receipt_scan_anonymized:<hmac("receipt:" + receipt_id)>`
- `receipt_item_anonymized:<hmac("receipt_item:" + receipt_item_id)>`

Une rotation brutale casserait le lien de suppression/synchronisation des anciens lots.

## Limites V1

- Les produits ne sont jamais crees depuis un ticket utilisateur.
- Les observations ne sont creees que pour les lignes `line_type = 'product'` et `item_status = 'user_validated'`.
- Les articles `trusted` automatiques ne nourrissent pas `market_`.
- Si la suppression d'un ticket reussit cote application mais que l'appel `market-record-observations` expire avant le delete anonymise, un ancien lot peut rester orphelin dans `market_seed_batches` / `market_price_observations`.
- La V1 supprime puis reinsere les observations du lot anonymise lors d'une synchronisation.

## Deploiement

Aucune migration distante, aucun secret reel et aucun deploy de fonction ne sont lances par cette implementation locale.
