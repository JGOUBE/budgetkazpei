-- Safely attach already-verified market identities to trusted receipt lines.
-- No price publication, no market observation and no user-edited aliases.
create or replace function public.shopping_link_verified_receipt_items(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_receipt record;
  v_updated integer := 0;
  v_total integer := 0;
  v_total_linked integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select r.id,r.store_name,r.store_location
    into v_receipt
    from public.receipts r
   where r.id=p_receipt_id and r.user_id=v_uid
     and r.validation_status='validated'
     and r.duplicate_of_receipt_id is null
     and r.removed_from_history_at is null
     and r.is_food_ticket is true;
  if not found then return jsonb_build_object('ok',false,'reason','receipt_not_eligible'); end if;

  with line_input as materialized (
    select i.id,i.user_id,
      coalesce(nullif(btrim(i.ocr_name),''),nullif(btrim(i.corrected_name),''),i.name) label,
      (row_number() over(order by i.id)-1)::int idx
    from public.receipt_items i
    where i.receipt_id=p_receipt_id and i.user_id=v_uid
      and i.line_type='product'
      and i.item_status in ('trusted','user_validated')
      and i.market_product_id is null
      and coalesce(i.market_matched,false)=false
      and coalesce(i.total_price,0)>0
      and length(btrim(coalesce(i.ocr_name,i.corrected_name,i.name,'')))>=4
  ),
  batch as (
    select jsonb_agg(jsonb_build_object('index',idx,'raw_name',label,
      'store_name',v_receipt.store_name,'store_city',coalesce(v_receipt.store_location,'')) order by idx) as payload
    from line_input
  ),
  candidates as materialized (
    select (t->>'index')::int idx,
      (t->>'market_product_id')::uuid product_id,
      t->>'market_match_type' match_type,
      (t->>'market_match_confidence')::numeric conf,
      t->>'market_canonical_name' canonical_name,
      t->>'market_brand' brand,
      t->>'market_category' category,
      t->>'market_subcategory' subcategory,
      t->>'market_package_format' package_format
    from batch b, lateral jsonb_array_elements(
      case when b.payload is null then '[]'::jsonb
      else public.market_resolve_exact_products(b.payload) end
    ) t
    where t->>'market_matched'='true'
      and t->>'market_product_id' is not null
      and (t->>'market_match_confidence')::numeric >= 0.97
      and t->>'market_match_type' in ('alias_exact','barcode_exact','normalized_name_exact')
  ),
  written as (
    update public.receipt_items i
      set market_product_id=c.product_id,
          market_matched=true,
          market_match_type=c.match_type,
          market_match_confidence=c.conf,
          market_canonical_name=c.canonical_name,
          market_brand=c.brand,
          market_category=c.category,
          market_subcategory=c.subcategory,
          market_package_format=c.package_format
    from line_input s join candidates c using(idx)
    where i.id=s.id and i.user_id=v_uid
      and i.market_product_id is null
      and coalesce(i.market_matched,false)=false
    returning i.id
  )
  select count(*) into v_updated from written;

  select count(*), count(*) filter(where market_matched and market_product_id is not null)
    into v_total,v_total_linked
    from public.receipt_items
   where receipt_id=p_receipt_id and user_id=v_uid and line_type='product';

  return jsonb_build_object('ok',true,'newly_linked',v_updated,
    'lines_total',v_total,'lines_linked',v_total_linked,
    'lines_unresolved',v_total-v_total_linked,'prices_created',0);
end;
$$;
revoke all on function public.shopping_link_verified_receipt_items(uuid) from public,anon;
grant execute on function public.shopping_link_verified_receipt_items(uuid) to authenticated;
comment on function public.shopping_link_verified_receipt_items(uuid) is
 'Authenticated, receipt-owner-only, non-destructive linking of exact verified market product identities. Never publishes prices.';
