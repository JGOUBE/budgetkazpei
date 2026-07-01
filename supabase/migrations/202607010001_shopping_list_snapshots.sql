create table if not exists public.shopping_list_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Liste de courses BudgetKazPei',
  items jsonb not null default '[]'::jsonb,
  total_estimated numeric(10, 2) not null default 0,
  missing_price_count integer not null default 0,
  total_items integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  shared_at timestamptz,
  share_method text not null default 'copy',
  status text not null default 'active',
  constraint shopping_list_snapshots_share_method_check
    check (share_method in ('native_share', 'whatsapp', 'sms', 'email', 'copy')),
  constraint shopping_list_snapshots_status_check
    check (status in ('active', 'deleted', 'expired'))
);

create index if not exists idx_shopping_list_snapshots_user_status
  on public.shopping_list_snapshots (user_id, status, expires_at desc);

alter table public.shopping_list_snapshots enable row level security;

drop policy if exists "shopping_list_snapshots_select_own" on public.shopping_list_snapshots;
create policy "shopping_list_snapshots_select_own"
  on public.shopping_list_snapshots
  for select
  using (auth.uid() = user_id);

drop policy if exists "shopping_list_snapshots_insert_own" on public.shopping_list_snapshots;
create policy "shopping_list_snapshots_insert_own"
  on public.shopping_list_snapshots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "shopping_list_snapshots_update_own" on public.shopping_list_snapshots;
create policy "shopping_list_snapshots_update_own"
  on public.shopping_list_snapshots
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "shopping_list_snapshots_delete_own" on public.shopping_list_snapshots;
create policy "shopping_list_snapshots_delete_own"
  on public.shopping_list_snapshots
  for delete
  using (auth.uid() = user_id);
