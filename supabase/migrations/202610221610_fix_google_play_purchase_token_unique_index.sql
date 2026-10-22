
drop index if exists public.user_subscriptions_google_play_purchase_token_uidx;

create unique index user_subscriptions_google_play_purchase_token_uidx
  on public.user_subscriptions (google_play_purchase_token);
