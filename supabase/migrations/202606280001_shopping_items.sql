create extension if not exists pgcrypto;

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  receipt_id uuid references public.receipts(id) on delete cascade,
  store text,
  product_name text not null,
  original_name text,
  corrected_name text,
  normalized_name text not null,
  brand text,
  category text default 'alimentaire',
  subcategory text,
  department text,
  quantity numeric(10,3) default 1,
  unit text,
  price numeric(10,2),
  price_per_unit numeric(10,2),
  promotion boolean default false,
  confidence_score numeric(5,2),
  currency text default 'EUR',
  barcode text,
  created_at timestamptz default now()
);

alter table public.shopping_items add column if not exists original_name text;
alter table public.shopping_items add column if not exists corrected_name text;
alter table public.shopping_items add column if not exists subcategory text;
alter table public.shopping_items add column if not exists department text;
alter table public.shopping_items add column if not exists promotion boolean default false;
alter table public.shopping_items add column if not exists confidence_score numeric(5,2);

alter table public.shopping_items enable row level security;

drop policy if exists "shopping_items_select_own" on public.shopping_items;
create policy "shopping_items_select_own"
  on public.shopping_items for select
  using (auth.uid() = user_id);

drop policy if exists "shopping_items_insert_own" on public.shopping_items;
create policy "shopping_items_insert_own"
  on public.shopping_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "shopping_items_update_own" on public.shopping_items;
create policy "shopping_items_update_own"
  on public.shopping_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "shopping_items_delete_own" on public.shopping_items;
create policy "shopping_items_delete_own"
  on public.shopping_items for delete
  using (auth.uid() = user_id);

create index if not exists shopping_items_user_created_idx
  on public.shopping_items (user_id, created_at desc);

create index if not exists shopping_items_user_normalized_idx
  on public.shopping_items (user_id, normalized_name);

create index if not exists shopping_items_user_store_idx
  on public.shopping_items (user_id, store);

create index if not exists shopping_items_transaction_idx
  on public.shopping_items (transaction_id);

create index if not exists shopping_items_receipt_idx
  on public.shopping_items (receipt_id);

create index if not exists shopping_items_barcode_idx
  on public.shopping_items (barcode);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
