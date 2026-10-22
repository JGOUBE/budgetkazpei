alter table public.user_subscriptions
  add column if not exists billing_source text,
  add column if not exists google_play_purchase_token text,
  add column if not exists google_play_product_id text,
  add column if not exists google_play_base_plan_id text,
  add column if not exists expires_at timestamptz,
  add column if not exists latest_order_id text;

update public.user_subscriptions
set billing_source = case
  when billing_source is not null then billing_source
  when stripe_subscription_id is not null then 'stripe'
  else 'legacy'
end
where billing_source is null;

create unique index if not exists user_subscriptions_google_play_purchase_token_uidx
  on public.user_subscriptions (google_play_purchase_token)
  where google_play_purchase_token is not null;

alter table public.profiles
  add column if not exists billing_source text;

comment on column public.user_subscriptions.billing_source is
  'Source de facturation: stripe, google_play ou legacy.';

comment on column public.user_subscriptions.google_play_purchase_token is
  'Jeton Google Play stocké uniquement côté serveur pour validation et synchronisation.';
