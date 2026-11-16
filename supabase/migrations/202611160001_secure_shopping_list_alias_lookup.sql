-- BudgetKazPei: let signed-in shoppers find public products through validated
-- search aliases, WITHOUT exposing receipt OCR strings or the alias table itself.
-- The result contains only active public product IDs and ranking scores.
begin;

create or replace function public.shopping_find_product_ids_by_alias(
  p_query text,
  p_limit integer default 24
)
returns table(product_id uuid, match_score integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_query text;
  v_terms text[];
  v_limit integer;
begin
  if (select auth.uid()) is null then
    return;
  end if;

  v_query := public.market_normalize_text(left(coalesce(p_query, ''), 100));
  if length(replace(v_query, ' ', '')) < 3 then
    return;
  end if;

  v_terms := regexp_split_to_array(v_query, ' +');
  v_limit := least(greatest(coalesce(p_limit, 24), 1), 30);

  return query
  select a.product_id,
    max(case
      when a.normalized_alias = v_query then 120
      when position(v_query in a.normalized_alias) = 1 then 100
      when position(v_query in a.normalized_alias) > 0 then 70
      else 35
    end)::integer as match_score
  from public.shopping_product_aliases a
  join public.shopping_products sp on sp.id = a.product_id and sp.is_active = true
  where coalesce(a.confidence_score, 0) >= 0.88
    -- The query is not retailer-specific. Exclude alias labels that point to
    -- different products across retailers rather than guessing a SKU.
    and not exists (
      select 1 from public.shopping_product_aliases conflicting
      where conflicting.normalized_alias = a.normalized_alias
        and conflicting.product_id <> a.product_id
    )
    and (
      a.normalized_alias = v_query
      or position(v_query in a.normalized_alias) > 0
      or not exists (
        select 1 from unnest(v_terms) as term
        where position(term in a.normalized_alias) = 0
      )
    )
  group by a.product_id
  order by 2 desc, a.product_id
  limit v_limit;
end
$function$;

revoke all on function public.shopping_find_product_ids_by_alias(text, integer)
  from public, anon;
grant execute on function public.shopping_find_product_ids_by_alias(text, integer)
  to authenticated;

comment on function public.shopping_find_product_ids_by_alias(text, integer) is
  'Authenticated search of validated product aliases; returns only public product IDs, never raw receipts, OCR labels, or private catalog metadata.';

commit;
