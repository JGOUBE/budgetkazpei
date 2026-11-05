-- Only provable 1:1 links between the two *existing* catalogs.
-- No product creation, price imports, or personal receipt access.
create table if not exists public.shopping_market_product_links (
  market_product_id uuid primary key references public.market_products(id) on delete cascade,
  shopping_product_id uuid not null unique references public.shopping_products(id) on delete cascade,
  match_method text not null check (match_method in ('exact_name_brand_size','barcode_verified','manual_verified')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists shopping_market_product_links_shopping_idx
 on public.shopping_market_product_links (shopping_product_id);
alter table public.shopping_market_product_links enable row level security;
revoke all on public.shopping_market_product_links from anon;
revoke all on public.shopping_market_product_links from authenticated;
grant select on public.shopping_market_product_links to authenticated;
drop policy if exists shopping_market_links_authenticated_read on public.shopping_market_product_links;
create policy shopping_market_links_authenticated_read
 on public.shopping_market_product_links for select to authenticated using (true);

with candidate as (
  select m.id market_id, s.id shopping_id,
    regexp_match(lower(btrim(s.size_label)),
      '^([0-9]+([.,][0-9]+)?)[[:space:]]*(kg|g|ml|cl|l)$') size_match,
    m.package_size_value market_size, m.package_size_unit market_unit
  from public.market_products m
  join public.shopping_products s on lower(btrim(m.canonical_name))=lower(btrim(s.display_name))
  where s.is_active is true
    and nullif(btrim(m.brand),'') is not null
    and nullif(btrim(s.brand),'') is not null
    and lower(btrim(m.brand))=lower(btrim(s.brand))
    and m.package_size_value > 0
    and m.package_size_unit in ('g','kg','ml','cl','l')
    and s.size_label is not null
), compatible as (
  select market_id, shopping_id from candidate
  where size_match is not null
    and case market_unit
      when 'g' then market_size
      when 'kg' then market_size*1000
      when 'ml' then market_size
      when 'cl' then market_size*10
      when 'l' then market_size*1000 end =
    case size_match[3]
      when 'g' then replace(size_match[1],',','.')::numeric
      when 'kg' then replace(size_match[1],',','.')::numeric*1000
      when 'ml' then replace(size_match[1],',','.')::numeric
      when 'cl' then replace(size_match[1],',','.')::numeric*10
      when 'l' then replace(size_match[1],',','.')::numeric*1000 end
), unique_compatible as (
  select market_id,shopping_id from compatible c
  where not exists(select 1 from compatible other where other.market_id=c.market_id and other.shopping_id<>c.shopping_id)
    and not exists(select 1 from compatible other where other.shopping_id=c.shopping_id and other.market_id<>c.market_id)
)
insert into public.shopping_market_product_links
 (market_product_id,shopping_product_id,match_method)
select market_id,shopping_id,'exact_name_brand_size'
from unique_compatible
on conflict do nothing;
