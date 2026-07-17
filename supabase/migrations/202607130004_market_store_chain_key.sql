create or replace function public.market_store_chain_key(p_store_name text)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when normalized like '%leclerc%' then 'e leclerc'
    when normalized like '%leader price%' then 'leader price'
    when normalized like '%super u%'
      or normalized like '%hyper u%'
      or normalized like '%u express%'
      or normalized = 'u'
      then 'u'
    when normalized like '%carrefour%' then 'carrefour'
    when normalized like '%intermarche%' then 'intermarche'
    when normalized like '%auchan%' then 'auchan'
    when normalized like '%lidl%' then 'lidl'
    when normalized like '%aldi%' then 'aldi'
    else normalized
  end
  from (
    select public.market_normalize_text(coalesce(p_store_name, '')) as normalized
  ) source;
$$;

revoke execute on function public.market_store_chain_key(text) from public;
revoke execute on function public.market_store_chain_key(text) from anon;
revoke execute on function public.market_store_chain_key(text) from authenticated;
grant execute on function public.market_store_chain_key(text) to postgres;
grant execute on function public.market_store_chain_key(text) to service_role;