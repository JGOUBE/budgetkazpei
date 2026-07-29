begin;

do $fix$
declare
  v_original_sql text;
  v_updated_sql text;
begin
  select pg_get_functiondef('public.market_resolve_exact_products(jsonb)'::regprocedure)
  into v_original_sql;

  if v_original_sql is null then
    raise exception 'public.market_resolve_exact_products(jsonb) does not exist';
  end if;

  v_updated_sql := regexp_replace(
    v_original_sql,
    $$select case when count\(\*\) = 1 then [^;]+
      into v_store_id
      from public\.market_stores
      where normalized_store_name = v_normalized_store_name
        and \(
          v_normalized_store_city = ''
          or normalized_city = v_normalized_store_city
        \);$$,
    $$select case
        when count(*) = 1 then (array_agg(id order by id))[1]
        else null
      end
      into v_store_id
      from public.market_stores
      where normalized_store_name = v_normalized_store_name
        and (
          v_normalized_store_city = ''
          or normalized_city = v_normalized_store_city
        );$$,
    'n'
  );

  if v_updated_sql = v_original_sql then
    raise exception 'normalized_store_name + normalized_city singleton lookup was not updated';
  end if;

  v_updated_sql := regexp_replace(
    v_updated_sql,
    $$select case when count\(\*\) = 1 then [^;]+
      into v_store_id
      from public\.market_stores
      where public\.market_store_chain_key\(store_name\) = v_store_chain
        and normalized_city = v_normalized_store_city;$$,
    $$select case
        when count(*) = 1 then (array_agg(id order by id))[1]
        else null
      end
      into v_store_id
      from public.market_stores
      where public.market_store_chain_key(store_name) = v_store_chain
        and normalized_city = v_normalized_store_city;$$,
    'n'
  );

  if position('(array_agg(id order by id))[1]' in v_updated_sql) = 0 then
    raise exception 'uuid singleton lookup fix was not applied';
  end if;

  if position('min(' || 'id)' in v_updated_sql) > 0 then
    raise exception 'remaining legacy uuid aggregate detected in market_resolve_exact_products(jsonb)';
  end if;

  execute v_updated_sql;
end
$fix$;

commit;
