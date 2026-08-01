create or replace function public.retail_sync_market_price_observation(
  p_candidate_id uuid,
  p_retail_price_observation_id uuid,
  p_market_store_id uuid,
  p_promotion_id uuid default null
)
returns table (
  observation_id uuid,
  action text,
  batch_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_existing_id uuid;
  v_batch_id uuid;
  v_batch_key text;
  v_batch_item_key text;
  v_observed_date date;
  v_unit_price numeric;
  v_unit_type text;
  v_is_promotion boolean := false;
  v_promotion_label text;
  v_price_before_discount numeric;
  v_discount_amount numeric;
  v_notes text;
begin
  if p_candidate_id is null then
    raise exception 'candidate id is required' using errcode = '22023';
  end if;

  if p_retail_price_observation_id is null then
    raise exception 'retail price observation id is required' using errcode = '22023';
  end if;

  if p_market_store_id is null then
    raise exception 'market store id is required' using errcode = '22023';
  end if;

  select *
  into v_candidate
  from public.retail_price_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'retail price candidate not found: %', p_candidate_id using errcode = 'P0002';
  end if;

  if v_candidate.matched_market_product_id is null then
    raise exception 'market sync requires matched_market_product_id for retail candidate %', p_candidate_id
      using errcode = '22000';
  end if;

  if v_candidate.current_price <= 0 then
    raise exception 'market sync requires a strictly positive current_price for retail candidate %', p_candidate_id
      using errcode = '22000';
  end if;

  v_observed_date := (v_candidate.source_observed_at at time zone 'Indian/Reunion')::date;

  if v_observed_date is null then
    raise exception 'market sync requires a valid observed date for retail candidate %', p_candidate_id
      using errcode = '22000';
  end if;

  if v_candidate.unit_price is not null
     and v_candidate.unit_price > 0
     and nullif(trim(coalesce(v_candidate.unit_price_unit, '')), '') is not null
  then
    v_unit_price := v_candidate.unit_price;
    v_unit_type := trim(v_candidate.unit_price_unit);
  else
    v_unit_price := null;
    v_unit_type := null;
  end if;

  v_is_promotion := v_candidate.price_type = 'promotion' and v_candidate.promotion_proven is true;
  v_promotion_label := case
    when v_is_promotion then coalesce(
      nullif(trim(coalesce(v_candidate.promo_badge, '')), ''),
      nullif(trim(coalesce(v_candidate.offer_mechanism, '')), ''),
      nullif(trim(coalesce(v_candidate.conditions, '')), ''),
      'Promotion retail'
    )
    else null
  end;

  v_price_before_discount := case
    when v_is_promotion
         and v_candidate.original_price is not null
         and v_candidate.original_price >= v_candidate.current_price
      then v_candidate.original_price
    else null
  end;

  v_discount_amount := case
    when v_price_before_discount is not null and v_price_before_discount > v_candidate.current_price
      then v_price_before_discount - v_candidate.current_price
    else null
  end;

  v_batch_key := format('retail_publication:%s', v_candidate.id);
  v_batch_item_key := format('retail_candidate:%s', v_candidate.id);
  v_notes := concat_ws(
    ' | ',
    format('retail_candidate_id=%s', v_candidate.id),
    format('retail_price_observation_id=%s', p_retail_price_observation_id),
    case
      when p_promotion_id is not null then format('shopping_promotion_id=%s', p_promotion_id)
      else null
    end,
    format('retailer_slug=%s', v_candidate.retailer_slug),
    format('store_slug=%s', v_candidate.store_slug),
    format('store_name=%s', v_candidate.store_name),
    case
      when nullif(trim(coalesce(v_candidate.store_city, '')), '') is not null
        then format('store_city=%s', v_candidate.store_city)
      else null
    end,
    format('source_type=%s', v_candidate.source_type),
    case
      when v_candidate.source_product_id is not null
        then format('source_product_id=%s', v_candidate.source_product_id)
      else null
    end,
    format('price_type=%s', v_candidate.price_type),
    format('source_url=%s', v_candidate.source_url)
  );

  insert into public.market_seed_batches (
    batch_key,
    source,
    store_id,
    observed_date,
    notes,
    receipt_total_before_discount,
    receipt_unallocated_discount,
    receipt_total_paid
  )
  values (
    v_batch_key,
    'retail_publication',
    p_market_store_id,
    v_observed_date,
    v_notes,
    null,
    null,
    null
  )
  on conflict (batch_key) do update
    set source = excluded.source,
        store_id = excluded.store_id,
        observed_date = excluded.observed_date,
        notes = excluded.notes,
        receipt_total_before_discount = null,
        receipt_unallocated_discount = null,
        receipt_total_paid = null
  returning id into v_batch_id;

  select observations.id
  into v_existing_id
  from public.market_price_observations as observations
  where observations.batch_id = v_batch_id
    and observations.batch_item_key = v_batch_item_key
  for update;

  if v_existing_id is null then
    insert into public.market_price_observations (
      store_id,
      product_id,
      observed_date,
      price,
      quantity,
      unit_price,
      unit_type,
      is_promotion,
      promotion_label,
      confidence,
      source,
      batch_id,
      batch_item_key,
      price_before_discount,
      discount_amount
    )
    values (
      p_market_store_id,
      v_candidate.matched_market_product_id,
      v_observed_date,
      v_candidate.current_price,
      1,
      v_unit_price,
      v_unit_type,
      v_is_promotion,
      v_promotion_label,
      1,
      'retail_publication',
      v_batch_id,
      v_batch_item_key,
      v_price_before_discount,
      v_discount_amount
    )
    returning id into observation_id;

    batch_id := v_batch_id;
    action := 'created';
    return next;
    return;
  end if;

  update public.market_price_observations
  set
    store_id = p_market_store_id,
    product_id = v_candidate.matched_market_product_id,
    observed_date = v_observed_date,
    price = v_candidate.current_price,
    quantity = 1,
    unit_price = v_unit_price,
    unit_type = v_unit_type,
    is_promotion = v_is_promotion,
    promotion_label = v_promotion_label,
    confidence = 1,
    source = 'retail_publication',
    price_before_discount = v_price_before_discount,
    discount_amount = v_discount_amount
  where id = v_existing_id
  returning id into observation_id;

  batch_id := v_batch_id;
  action := 'updated';
  return next;
end;
$$;

alter function public.retail_sync_market_price_observation(uuid, uuid, uuid, uuid) owner to postgres;
revoke all on function public.retail_sync_market_price_observation(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.retail_sync_market_price_observation(uuid, uuid, uuid, uuid) to postgres, service_role;
