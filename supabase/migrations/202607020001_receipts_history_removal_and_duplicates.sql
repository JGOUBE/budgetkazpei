alter table public.receipts add column if not exists hidden_at timestamptz;
alter table public.receipts add column if not exists image_deleted_at timestamptz;
alter table public.receipts add column if not exists removed_from_history_at timestamptz;
alter table public.receipts add column if not exists removal_type text;
alter table public.receipts add column if not exists duplicate_confirmed boolean default false;
alter table public.receipts add column if not exists duplicate_of_receipt_id uuid references public.receipts(id) on delete set null;
alter table public.receipts add column if not exists normalized_store_name text;
alter table public.receipts add column if not exists store_location text;
alter table public.receipts add column if not exists image_deleted_reason text;
alter table public.receipts add column if not exists image_url text;
alter table public.receipts add column if not exists storage_path text;

create index if not exists receipts_user_visible_created_idx
  on public.receipts (user_id, removed_from_history_at, created_at desc);

create index if not exists receipts_user_duplicate_lookup_idx
  on public.receipts (user_id, purchase_date, total_amount);

create index if not exists receipts_user_duplicate_of_idx
  on public.receipts (user_id, duplicate_of_receipt_id);
