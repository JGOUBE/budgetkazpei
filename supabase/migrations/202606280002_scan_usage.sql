create extension if not exists pgcrypto;

create table if not exists public.scan_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  scan_count integer not null default 0,
  ai_scan_count integer not null default 0,
  manual_count integer not null default 0,
  plan text not null default 'free',
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_usage_month_format check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint scan_usage_plan_check check (plan in ('free', 'premium', 'premium_plus')),
  constraint scan_usage_counts_check check (
    scan_count >= 0
    and ai_scan_count >= 0
    and manual_count >= 0
    and scan_count >= ai_scan_count
    and scan_count >= manual_count
  ),
  unique (user_id, month_key)
);

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

create index if not exists scan_usage_user_month_idx
  on public.scan_usage (user_id, month_key desc);

create index if not exists scan_usage_last_scan_idx
  on public.scan_usage (user_id, last_scan_at desc);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.scan_usage to authenticated;
