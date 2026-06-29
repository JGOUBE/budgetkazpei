create extension if not exists pgcrypto;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text,
  purchase_date date,
  total_amount numeric(10,2),
  currency text default 'EUR',
  image_path text,
  ocr_text text,
  ocr_status text default 'pending',
  ai_used boolean default false,
  validation_status text default 'draft',
  transaction_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ocr_name text,
  corrected_name text,
  normalized_name text,
  brand text,
  quantity numeric(10,2) default 1,
  unit text,
  unit_price numeric(10,2),
  total_price numeric(10,2),
  category text default 'alimentaire',
  subcategory text,
  department text,
  ticket_section text,
  promotion boolean default false,
  confidence_score numeric(5,2),
  created_at timestamptz default now()
);

alter table public.receipt_items add column if not exists ocr_name text;
alter table public.receipt_items add column if not exists corrected_name text;
alter table public.receipt_items add column if not exists normalized_name text;
alter table public.receipt_items add column if not exists brand text;
alter table public.receipt_items add column if not exists unit text;
alter table public.receipt_items add column if not exists subcategory text;
alter table public.receipt_items add column if not exists department text;
alter table public.receipt_items add column if not exists ticket_section text;
alter table public.receipt_items add column if not exists promotion boolean default false;

alter table public.transactions
  add column if not exists receipt_id uuid references public.receipts(id) on delete set null;

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

drop policy if exists "receipts_select_own" on public.receipts;
create policy "receipts_select_own"
  on public.receipts for select
  using (auth.uid() = user_id);

drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own"
  on public.receipts for insert
  with check (auth.uid() = user_id);

drop policy if exists "receipts_update_own" on public.receipts;
create policy "receipts_update_own"
  on public.receipts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "receipts_delete_own" on public.receipts;
create policy "receipts_delete_own"
  on public.receipts for delete
  using (auth.uid() = user_id);

drop policy if exists "receipt_items_select_own" on public.receipt_items;
create policy "receipt_items_select_own"
  on public.receipt_items for select
  using (auth.uid() = user_id);

drop policy if exists "receipt_items_insert_own" on public.receipt_items;
create policy "receipt_items_insert_own"
  on public.receipt_items for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.receipts
      where receipts.id = receipt_items.receipt_id
      and receipts.user_id = auth.uid()
    )
  );

drop policy if exists "receipt_items_update_own" on public.receipt_items;
create policy "receipt_items_update_own"
  on public.receipt_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "receipt_items_delete_own" on public.receipt_items;
create policy "receipt_items_delete_own"
  on public.receipt_items for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('receipt-images', 'receipt-images', false)
on conflict (id) do update set public = false;

drop policy if exists "receipt_images_select_own" on storage.objects;
create policy "receipt_images_select_own"
  on storage.objects for select
  using (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipt_images_insert_own" on storage.objects;
create policy "receipt_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipt_images_update_own" on storage.objects;
create policy "receipt_images_update_own"
  on storage.objects for update
  using (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipt_images_delete_own" on storage.objects;
create policy "receipt_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create index if not exists receipts_user_created_idx on public.receipts (user_id, created_at desc);
create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id);
create index if not exists transactions_receipt_idx on public.transactions (receipt_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.receipt_items to authenticated;
grant select, update on public.transactions to authenticated;
