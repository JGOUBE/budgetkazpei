begin;

create or replace function public.retail_resolve_market_store(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_store_id uuid;
  v_normalized_store_name text;
  v_normalized_store_city text;
  v_store_chain text;
begin
  if p_candidate_id is null then
    raise exception 'candidate id is required' using errcode = '22023';
  end if;

  select *
  into v_candidate
  from public.retail_price_candidates
  where id = p_candidate_id;

  if not found then
    raise exception 'retail price candidate not found: %', p_candidate_id using errcode = 'P0002';
  end if;

  v_normalized_store_name := public.market_normalize_text(coalesce(v_candidate.store_name, ''));
  v_normalized_store_city := public.market_normalize_text(coalesce(v_candidate.store_city, ''));
  v_store_chain := public.market_store_chain_key(v_candidate.store_name);

  if v_normalized_store_name = '' then
    raise exception 'market store resolution requires a non-empty store_name for retail candidate %', p_candidate_id
      using errcode = '22000';
  end if;

  select mappings.market_store_id
  into v_store_id
  from public.retail_market_store_mappings mappings
  where mappings.retailer_slug = v_candidate.retailer_slug
    and mappings.store_slug = v_candidate.store_slug;

  if v_store_id is null and v_normalized_store_city = '' then
    raise exception 'market store unresolved for retail candidate %: store_city is null and no explicit retailer/store scope mapping exists (store_name=%)',
      p_candidate_id,
      coalesce(v_candidate.store_name, '')
      using errcode = '22000';
  end if;

  if v_store_id is null then
    select case
      when count(*) = 1 then (array_agg(id order by id))[1]
      else null
    end
    into v_store_id
    from public.market_stores
    where normalized_store_name = v_normalized_store_name
      and (
        v_normalized_store_city = ''
        or normalized_city = v_normalized_store_city
      );
  end if;

  if v_store_id is null
     and v_store_chain <> ''
     and v_normalized_store_city <> ''
  then
    select case
      when count(*) = 1 then (array_agg(id order by id))[1]
      else null
    end
    into v_store_id
    from public.market_stores
    where public.market_store_chain_key(store_name) = v_store_chain
      and normalized_city = v_normalized_store_city;
  end if;

  if v_store_id is null then
    raise exception 'market store unresolved for retail candidate % (store_name=%, store_city=%)',
      p_candidate_id,
      coalesce(v_candidate.store_name, ''),
      coalesce(v_candidate.store_city, '')
      using errcode = '22000';
  end if;

  return v_store_id;
end;
$$;

alter function public.retail_resolve_market_store(uuid) owner to postgres;
revoke all on function public.retail_resolve_market_store(uuid) from public, anon, authenticated;
grant execute on function public.retail_resolve_market_store(uuid) to postgres, service_role;

commit;

