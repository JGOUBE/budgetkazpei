alter table public.receipt_items
  add column if not exists market_product_id uuid null,
  add column if not exists market_matched boolean not null default false,
  add column if not exists market_match_type text null,
  add column if not exists market_match_confidence numeric null,
  add column if not exists market_canonical_name text null,
  add column if not exists market_brand text null,
  add column if not exists market_category text null,
  add column if not exists market_subcategory text null,
  add column if not exists market_package_format text null;

create index if not exists receipt_items_market_matched_idx
  on public.receipt_items (receipt_id, market_matched)
  where market_matched = true;
