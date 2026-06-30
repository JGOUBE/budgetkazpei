create extension if not exists pgcrypto;

alter table public.receipts add column if not exists merchant_name text;
alter table public.receipts add column if not exists merchant_confidence numeric(5,2) default 0;
alter table public.receipts add column if not exists date_status text default 'detected';
alter table public.receipts add column if not exists ticket_type text default 'other';
alter table public.receipts add column if not exists budget_category text default 'divers';
alter table public.receipts add column if not exists is_food_ticket boolean default false;
alter table public.receipts add column if not exists scan_level_used integer default 1;
alter table public.receipts add column if not exists scan_duration_ms integer default 0;
alter table public.receipts add column if not exists confidence_score numeric(5,2) default 0;
alter table public.receipts add column if not exists escalation_reason text;
alter table public.receipts add column if not exists scan_status text default 'success';

alter table public.receipt_items add column if not exists item_status text default 'detected';
alter table public.receipt_items add column if not exists line_type text default 'product';
alter table public.receipt_items add column if not exists item_source text default 'parser';

alter table public.scan_metrics add column if not exists scan_level_used integer;
alter table public.scan_metrics add column if not exists confidence_score numeric(5,2);
alter table public.scan_metrics add column if not exists escalation_reason text;
alter table public.scan_metrics add column if not exists scan_status text;

create table if not exists public.product_dictionary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_name text not null,
  canonical_name text not null,
  ocr_label text,
  merchant_name text,
  brand text,
  category text default 'alimentaire',
  subcategory text,
  confidence_score numeric(5,2) default 0,
  occurrences integer not null default 1,
  first_seen timestamptz default now(),
  last_seen timestamptz default now(),
  average_price numeric(10,2),
  min_price numeric(10,2),
  max_price numeric(10,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint product_dictionary_occurrences_check check (occurrences >= 1)
);

alter table public.product_dictionary enable row level security;

drop policy if exists "product_dictionary_select_own" on public.product_dictionary;
create policy "product_dictionary_select_own"
  on public.product_dictionary for select
  using (auth.uid() = user_id);

drop policy if exists "product_dictionary_insert_own" on public.product_dictionary;
create policy "product_dictionary_insert_own"
  on public.product_dictionary for insert
  with check (auth.uid() = user_id);

drop policy if exists "product_dictionary_update_own" on public.product_dictionary;
create policy "product_dictionary_update_own"
  on public.product_dictionary for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "product_dictionary_delete_own" on public.product_dictionary;
create policy "product_dictionary_delete_own"
  on public.product_dictionary for delete
  using (auth.uid() = user_id);

create unique index if not exists product_dictionary_user_normalized_idx
  on public.product_dictionary (user_id, normalized_name);

create index if not exists product_dictionary_user_seen_idx
  on public.product_dictionary (user_id, last_seen desc);

grant select, insert, update, delete on public.product_dictionary to authenticated;
