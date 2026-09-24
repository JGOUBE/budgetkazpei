begin;

-- Keep future public objects opt-in for the Data API.
-- This matches Supabase's new safer default and avoids relying on legacy auto-grants.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Existing frontend contract: authenticated users manage only their own rows through RLS.
-- Make the table privileges explicit so a fresh database does not depend on legacy defaults.
revoke select, insert, update, delete
  on table public.shopping_list_snapshots
  from anon;

grant select, insert, update, delete
  on table public.shopping_list_snapshots
  to authenticated;

-- Internal retail mapping used directly by the Cloud Run promo collector.
-- Keep it private to browser roles; service_role only needs read access.
alter table public.retail_market_store_mappings enable row level security;

revoke select, insert, update, delete
  on table public.retail_market_store_mappings
  from anon, authenticated;

grant select
  on table public.retail_market_store_mappings
  to service_role;

commit;
