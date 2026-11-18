-- Secure Stripe event verification. Secret stays encrypted in Supabase Vault.
-- Only the Edge Function service role may retrieve the signing secret.
create or replace function public.get_budgetkazpei_stripe_signing_secret()
returns text
language sql security definer
set search_path = 'public','vault','pg_catalog'
as $function$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = 'budgetkazpei_stripe_signing_secret'
  limit 1
$function$;
revoke all on function public.get_budgetkazpei_stripe_signing_secret() from public, anon, authenticated;
grant execute on function public.get_budgetkazpei_stripe_signing_secret() to service_role;

create table if not exists public.budgetkazpei_stripe_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
alter table public.budgetkazpei_stripe_events enable row level security;
revoke all on public.budgetkazpei_stripe_events from public, anon, authenticated;
grant select,insert on public.budgetkazpei_stripe_events to service_role;

alter table public.user_subscriptions
  add column if not exists stripe_event_created bigint not null default 0;
-- Event updates are idempotent at the subscription level via its existing
-- unique stripe_subscription_id index. Existing rows are not modified.
