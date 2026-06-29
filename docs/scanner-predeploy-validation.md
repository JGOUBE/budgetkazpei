# Scanner IA - deploiement Supabase distant sans Docker

Objectif : deployer le scanner BudgetKazPei avec le projet Supabase distant existant.

Cette procedure est concue pour ton mode actuel : Supabase distant uniquement, sans Docker Desktop et sans base Supabase locale.

Les migrations SQL sont a appliquer manuellement dans le Dashboard Supabase, via SQL Editor.

## 1. Ordre exact des migrations SQL

Ouvrir Supabase Dashboard > SQL Editor.

Executer les fichiers dans cet ordre, un par un :

1. `supabase/migrations/202606270001_receipts_foundations.sql`
2. `supabase/migrations/202606280001_shopping_items.sql`
3. `supabase/migrations/202606280002_scan_usage.sql`
4. `supabase/migrations/202606280003_scan_metrics.sql`

Ne pas inverser l'ordre :

- `shopping_items` reference `receipts`
- `scan_metrics` peut referencer `receipts`
- `scan_usage` et `scan_metrics` doivent arriver apres les fondations scanner

## 2. Validation apres chaque migration

Apres chaque execution dans SQL Editor, verifier que Supabase affiche `Success. No rows returned` ou un equivalent sans erreur.

Ensuite executer cette verification :

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
and table_name in ('receipts', 'receipt_items', 'shopping_items', 'scan_usage', 'scan_metrics')
order by table_name;
```

Resultat attendu :

- `receipt_items`
- `receipts`
- `scan_metrics`
- `scan_usage`
- `shopping_items`

Verifier RLS :

```sql
select relname, relrowsecurity
from pg_class
where relname in ('receipts', 'receipt_items', 'shopping_items', 'scan_usage', 'scan_metrics')
order by relname;
```

Resultat attendu : `relrowsecurity = true` pour chaque table.

Verifier les policies :

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
and tablename in ('receipts', 'receipt_items', 'shopping_items', 'scan_usage', 'scan_metrics')
order by tablename, policyname;
```

Chaque table doit avoir des policies owner-only pour select/insert/update/delete.

Verifier les contraintes scanner :

```sql
select conrelid::regclass as table_name, conname
from pg_constraint
where conrelid in (
  'public.scan_usage'::regclass,
  'public.scan_metrics'::regclass
)
order by table_name, conname;
```

## 3. Secrets a ajouter

Depuis le terminal, dans le projet :

```powershell
cd C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei
supabase link --project-ref gndqeqbizhydbktgedjg
```

Ajouter les secrets obligatoires :

```powershell
supabase secrets set OPENAI_API_KEY="sk-..."
supabase secrets set OPENAI_SCAN_MODEL="gpt-4o-mini"
```

Secrets optionnels pour calculer `estimated_cost_eur` dans `scan_metrics` :

```powershell
supabase secrets set OPENAI_SCAN_INPUT_COST_PER_1M="VALEUR_A_VERIFIER"
supabase secrets set OPENAI_SCAN_OUTPUT_COST_PER_1M="VALEUR_A_VERIFIER"
```

Si ces deux valeurs optionnelles ne sont pas ajoutees, le cout estime reste `null`. C'est volontaire : BudgetKazPei ne doit pas inventer un cout.

Verifier les secrets :

```powershell
supabase secrets list
```

## 4. Edge Function a deployer

Fonction scanner a deployer :

```powershell
supabase functions deploy scan-receipt-ocr
```

Les autres Edge Functions existantes ne sont pas necessaires pour activer le scanner :

- `assistant-aisupabase`
- `send-support-email`
- `stripe-webhook`

Ne les redeployer que si tu as modifie ces fonctions.

## 5. Tests apres deploiement

### Test 1 - fonction accessible

Dans Supabase Dashboard > Edge Functions, verifier que `scan-receipt-ocr` apparait comme deployee.

### Test 2 - scan manuel

Dans BudgetKazPei :

1. Ouvrir `Mes tickets`
2. Cliquer `Remplir manuellement`
3. Ajouter magasin, date, total et au moins un article
4. Enregistrer

Resultat attendu :

- une depense est creee
- un ticket est cree
- des lignes `receipt_items` sont creees
- des lignes `shopping_items` sont creees
- `scan_usage` est incremente
- `scan_metrics` recoit une ligne `success`

Verification SQL :

```sql
select month_key, scan_count, ai_scan_count, manual_count, plan, last_scan_at
from public.scan_usage
order by created_at desc
limit 20;
```

```sql
select model, provider, image_initial_bytes, image_compressed_bytes,
       ocr_duration_ms, openai_duration_ms, parsing_duration_ms, import_duration_ms,
       input_tokens, output_tokens, estimated_cost_eur, status, error_code
from public.scan_metrics
order by created_at desc
limit 20;
```

### Test 3 - scan image

Dans BudgetKazPei :

1. Ouvrir `Mes tickets`
2. Cliquer `Importer une image`
3. Choisir un ticket lisible
4. Verifier les champs detectes
5. Importer

Resultat attendu :

- magasin detecte si lisible
- date detectee si lisible
- total detecte si lisible
- articles detectes si lisibles
- validation manuelle possible avant import
- `scan_metrics.provider = supabase-openai-vision` si l'Edge Function a ete utilisee
- `scan_metrics.status = success`

### Test 4 - erreur controlee

Supprimer temporairement `OPENAI_API_KEY` n'est pas recommande en production.

Pour tester une erreur sans casser les secrets, utiliser une image illisible ou couper la connexion.

Resultat attendu :

- pas de crash
- message avec code `SCAN_*`
- formulaire manuel disponible
- `scan_metrics.status = error` si l'application peut enregistrer la metrique

## 6. Idempotence et impact

Les migrations scanner sont concues pour etre rejouables :

- `create extension if not exists`
- `create table if not exists`
- `drop policy if exists` puis `create policy`
- `create index if not exists`

Impact sur tables existantes :

- `202606270001_receipts_foundations.sql` ajoute seulement `transactions.receipt_id` si absent
- `202606280001_shopping_items.sql` cree `shopping_items`
- `202606280002_scan_usage.sql` cree `scan_usage`
- `202606280003_scan_metrics.sql` cree `scan_metrics`

No-go si :

- une migration SQL affiche une erreur
- `relrowsecurity` n'est pas `true`
- une table n'a pas ses policies RLS
- `scan-receipt-ocr` retourne `SCAN_OPENAI_KEY_MISSING` apres ajout des secrets
- un utilisateur peut lire les tickets/metriques d'un autre utilisateur

## 7. Commandes finales resumees

```powershell
cd C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei
supabase link --project-ref gndqeqbizhydbktgedjg
supabase secrets set OPENAI_API_KEY="sk-..."
supabase secrets set OPENAI_SCAN_MODEL="gpt-4o-mini"
supabase functions deploy scan-receipt-ocr
```

Les migrations SQL ne sont pas appliquees par commande dans cette procedure. Elles sont collees et executees manuellement dans Supabase Dashboard > SQL Editor.
