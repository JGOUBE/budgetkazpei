create extension if not exists pgcrypto;

create table if not exists public.scan_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid references public.receipts(id) on delete set null,
  model text,
  provider text,
  ocr_engine text,
  ai_used boolean,
  text_ai_used boolean,
  vision_used boolean,
  fallback_used boolean,
  image_initial_bytes integer,
  image_compressed_bytes integer,
  ocr_duration_ms integer,
  openai_duration_ms integer,
  parsing_duration_ms integer,
  import_duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_eur numeric(12,6),
  items_detected integer,
  receipt_items_created integer,
  shopping_items_created integer,
  transaction_created boolean,
  scan_usage_incremented boolean,
  success boolean,
  status text not null default 'success',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint scan_metrics_status_check check (status in ('success', 'error')),
  constraint scan_metrics_sizes_check check (
    (image_initial_bytes is null or image_initial_bytes >= 0)
    and (image_compressed_bytes is null or image_compressed_bytes >= 0)
  ),
  constraint scan_metrics_durations_check check (
    (ocr_duration_ms is null or ocr_duration_ms >= 0)
    and (openai_duration_ms is null or openai_duration_ms >= 0)
    and (parsing_duration_ms is null or parsing_duration_ms >= 0)
    and (import_duration_ms is null or import_duration_ms >= 0)
  ),
  constraint scan_metrics_tokens_check check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
  ),
  constraint scan_metrics_cost_check check (estimated_cost_eur is null or estimated_cost_eur >= 0)
);

alter table public.scan_metrics add column if not exists ocr_engine text;
alter table public.scan_metrics add column if not exists ai_used boolean;
alter table public.scan_metrics add column if not exists text_ai_used boolean;
alter table public.scan_metrics add column if not exists vision_used boolean;
alter table public.scan_metrics add column if not exists fallback_used boolean;
alter table public.scan_metrics add column if not exists items_detected integer;
alter table public.scan_metrics add column if not exists receipt_items_created integer;
alter table public.scan_metrics add column if not exists shopping_items_created integer;
alter table public.scan_metrics add column if not exists transaction_created boolean;
alter table public.scan_metrics add column if not exists scan_usage_incremented boolean;
alter table public.scan_metrics add column if not exists success boolean;

alter table public.scan_metrics enable row level security;

drop policy if exists "scan_metrics_select_own" on public.scan_metrics;
create policy "scan_metrics_select_own"
  on public.scan_metrics for select
  using (auth.uid() = user_id);

drop policy if exists "scan_metrics_insert_own" on public.scan_metrics;
create policy "scan_metrics_insert_own"
  on public.scan_metrics for insert
  with check (auth.uid() = user_id);

drop policy if exists "scan_metrics_update_own" on public.scan_metrics;
create policy "scan_metrics_update_own"
  on public.scan_metrics for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "scan_metrics_delete_own" on public.scan_metrics;
create policy "scan_metrics_delete_own"
  on public.scan_metrics for delete
  using (auth.uid() = user_id);

create index if not exists scan_metrics_user_created_idx
  on public.scan_metrics (user_id, created_at desc);

create index if not exists scan_metrics_receipt_idx
  on public.scan_metrics (receipt_id);

create index if not exists scan_metrics_status_idx
  on public.scan_metrics (user_id, status, created_at desc);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.scan_metrics to authenticated;
