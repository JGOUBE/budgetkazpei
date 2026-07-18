-- ROLLBACK D'URGENCE MANUEL
-- NE PAS EXECUTER SANS VALIDATION EXPLICITE.
-- PROJET : BUDGETKAZPEI UNIQUEMENT.
--
-- Annule la migration 202607180001_receipt_scan_server_quota.sql et restaure
-- l'ancien comportement de public.scan_usage.
-- Attention : l'ancien comportement peut etre moins securise, car les clients
-- authentifies recuperent les droits directs insert/update/delete historiques.
-- A utiliser uniquement si la migration doit etre annulee rapidement.
-- Apres mise en production, une nouvelle migration corrective est preferable.

begin;

drop function if exists public.reserve_receipt_scan(uuid, text);
drop function if exists public.complete_receipt_scan(uuid);
drop function if exists public.release_receipt_scan(uuid, text);
drop function if exists public.increment_scan_usage(text);
drop function if exists public.receipt_scan_resolve_plan(uuid);
drop function if exists public.receipt_scan_normalize_plan(text);
drop function if exists public.receipt_scan_limit_reason(text);
drop function if exists public.receipt_scan_plan_limit(text);
drop function if exists public.receipt_scan_month_key(timestamptz);

drop table if exists public.receipt_scan_requests;

alter table public.scan_usage enable row level security;

drop policy if exists "scan_usage_select_own" on public.scan_usage;
create policy "scan_usage_select_own"
  on public.scan_usage for select
  using (auth.uid() = user_id);

drop policy if exists "scan_usage_insert_own" on public.scan_usage;
create policy "scan_usage_insert_own"
  on public.scan_usage for insert
  with check (auth.uid() = user_id);

drop policy if exists "scan_usage_update_own" on public.scan_usage;
create policy "scan_usage_update_own"
  on public.scan_usage for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "scan_usage_delete_own" on public.scan_usage;
create policy "scan_usage_delete_own"
  on public.scan_usage for delete
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.scan_usage to authenticated;

commit;
