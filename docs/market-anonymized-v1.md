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
- Une observation de prix n'est publiee que si `market_resolve_exact_products` retrouve un `market_product_id` existant. Un texte corrige libre ne suffit donc pas a creer un produit ou un prix collectif.
- Si la suppression d'un ticket reussit cote application mais que l'appel `market-record-observations` expire avant le delete anonymise, un ancien lot peut rester orphelin dans `market_seed_batches` / `market_price_observations`.
- La V1 supprime puis reinsere les observations du lot anonymise lors d'une synchronisation.

## Corrections personnelles et alias communautaires

- La correction reste immediate dans le ticket, les Courses intelligentes et le `product_dictionary` propres a l'utilisateur.
- Les alias presents avant la migration anti-poisoning appartiennent a l'amorcage assiste par l'administrateur : ils sont marques `curated` et restent actifs sans seuil communautaire, sauf deux alias explicitement audites et mis en quarantaine.
- Leur ancien `validation_count` est remis a 1 et les compteurs independants a 0 : les repetitions historiques ne constituent aucune preuve communautaire.
- Un alias `user_learned` reste candidat tant qu'il n'a pas au moins 2 utilisateurs et 2 tickets distincts dans un scope magasin/enseigne, ou 3 utilisateurs et 3 tickets dans le scope global.
- `validation_count` reste disponible pour compatibilite mais correspond, pour un alias utilisateur, au nombre d'empreintes utilisateur distinctes.
- Le registre anti-abus ne contient ni `user_id` ni `receipt_id` : seulement des empreintes HMAC-SHA-256 calculees avec un secret prive conserve en base.
- Un meme ticket est idempotent grace a l'unicite `(alias_id, ticket_fingerprint)`. Les repetitions mettent uniquement a jour la derniere observation et son compteur technique.
- Deux produits differents proposes pour le meme libelle et le meme scope placent les alias utilisateur en `conflict`; ils ne sont plus utilisables par le resolver.
- Les URL, emails, textes absurdes, metadonnees de caisse et substitutions lexicalement sans rapport avec un produit existant sont rejetes ou mis en quarantaine cote SQL.

## Deploiement

Aucune migration distante, aucun secret reel et aucun deploy de fonction ne sont lances par cette implementation locale.
