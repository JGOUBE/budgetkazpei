-- Candidate savings only when the same verified commercial SKU has a dated,
-- published offer at a DIFFERENT retailer. Receipt owner and paid total are
-- checked server side. No brand/category fuzzy matching and no current-price claims.
create or replace function public.shopping_verified_catalog_savings(p_max_age_days integer default 180)
returns table (
  shopping_product_id uuid,
  product_name text,
  reference_price numeric,
  reference_store text,
  reference_date date,
  alternative_price numeric,
  alternative_retailer_slug text,
  alternative_commune text,
  alternative_locality text,
  alternative_date date,
  saving_per_pack numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
with receipt_balances as (
  select r.id,r.user_id,r.store_name,r.store_location,r.purchase_date,r.created_at,
    r.total_amount,
    abs(coalesce(sum(i.total_price),0)-r.total_amount) as mismatch
  from public.receipts r
  join public.receipt_items i on i.receipt_id=r.id and i.user_id=r.user_id
  where r.user_id=auth.uid() and r.validation_status='validated'
    and r.removed_from_history_at is null
    and r.duplicate_of_receipt_id is null
    and r.is_food_ticket=true
    and r.purchase_date<=current_date
  group by r.id
),
user_purchases as (
  select i.market_product_id,r.store_name,r.store_location,r.purchase_date,
    r.created_at,r.mismatch,i.confidence_score,i.item_status,
    case when i.quantity>0 and i.unit_price>0 and
      abs(i.quantity*i.unit_price-i.total_price)<=0.02
      then i.unit_price else null end as pack_price,
    case
      when public.market_normalize_text(r.store_name) like '%leclerc%' then 'e-leclerc'
      when public.market_normalize_text(r.store_name) like '%leader price%' then 'leader-price'
      when public.market_normalize_text(r.store_name) like '%super u%' then 'super-u'
      when public.market_normalize_text(r.store_name) like '%carrefour market%' then 'carrefour-market'
      when public.market_normalize_text(r.store_name) like '%carrefour%' then 'carrefour'
      else null end as retailer_slug,
    row_number() over(partition by i.market_product_id order by r.purchase_date desc,r.created_at desc,i.id desc) seq
  from receipt_balances r
  join public.receipt_items i on i.receipt_id=r.id and i.user_id=r.user_id
  where i.market_matched is true and i.market_product_id is not null
    and i.line_type='product'
    and i.item_status in('trusted','user_validated')
    and i.total_price>0
    and i.market_match_confidence>=0.97
),
verified_reference as (
  select * from user_purchases p
  where p.seq=1 and p.mismatch<=0.05
    and p.pack_price>0 and p.retailer_slug is not null
    and (case when p.confidence_score between 0 and 1 then p.confidence_score*100
              else p.confidence_score end)>=85
),
offers as (
  select sp.id as shopping_id,sp.display_name as public_name,ref.pack_price,
    ref.store_name,ref.purchase_date,
    o.price as offer_price,o.retailer_slug as offer_chain,
    o.commune as offer_commune,o.locality as offer_locality,
    o.observed_at::date as offer_date,
    row_number() over(partition by sp.id order by o.price asc,o.observed_at desc,o.id) rn
  from verified_reference ref
  join public.shopping_market_product_links link
    on link.market_product_id=ref.market_product_id and link.verified_at is not null
  join public.shopping_products sp
    on sp.id=link.shopping_product_id and sp.is_active=true
  join public.shopping_price_observations o
    on o.product_id=sp.id and o.is_publishable=true
      and o.verified_at is not null and o.confidence_score>=0.95
      and o.observed_at::date between
        current_date - least(greatest(coalesce(p_max_age_days,180),30),240) and current_date
      and o.retailer_slug<>ref.retailer_slug
      and o.price>0 and o.price<=ref.pack_price-0.10
  where auth.uid() is not null
    and not (
      coalesce(btrim(sp.size_label),'')=''
      and public.market_normalize_text(sp.display_name) ~
        '^(pomme|pommes|poire|poires|banane|bananes|raisin|raisins|mangue|mangues|aubergine|aubergines|avocat|avocats|fruit|fruits|tomate|tomates|concombre|concombres|carotte|carottes|oignon|oignons)( |$)'
    )
)
select shopping_id,public_name,round(pack_price,2),store_name,purchase_date,
  round(offer_price,2),offer_chain,offer_commune,offer_locality,offer_date,
  round(pack_price-offer_price,2)
from offers
where rn=1
order by pack_price-offer_price desc,public_name
limit 35;
$$;
revoke all on function public.shopping_verified_catalog_savings(integer) from public,anon;
grant execute on function public.shopping_verified_catalog_savings(integer) to authenticated;
comment on function public.shopping_verified_catalog_savings(integer) is
  'Owner-scoped SKU-verified dated alternative retailer prices; excludes receipts with unallocated discounts and avoids fuzzy matches.';
