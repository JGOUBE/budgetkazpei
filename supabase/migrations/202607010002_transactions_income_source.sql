alter table public.transactions
  add column if not exists source text default 'manual';

create index if not exists transactions_user_source_date_idx
  on public.transactions (user_id, source, date desc);

update public.transactions
set source = 'manual'
where source is null;
