-- Verified published observations remain readable with their actual observation date.
-- Do not hide old verified prices at the database layer: freshness is a
-- presentation/estimation decision, not an authorization criterion.
drop policy if exists "Public read verified observed prices"
  on public.shopping_price_observations;

create policy "Public read verified observed prices"
  on public.shopping_price_observations
  for select
  to anon, authenticated
  using (is_publishable = true and verified_at is not null);
