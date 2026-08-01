create or replace function public.retail_quantity_contract_error(
  p_package_format text,
  p_quantity_value numeric,
  p_quantity_unit text,
  p_pack_count integer,
  p_total_quantity_value numeric,
  p_total_quantity_unit text,
  p_unit_price numeric,
  p_unit_price_unit text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_allowed_units constant text[] := array['unite', 'bloc', 'piece', 'kg', 'g', 'l', 'cl', 'ml'];
  v_format text := public.market_normalize_text(coalesce(p_package_format, ''));
  v_quantity_unit text := lower(trim(coalesce(p_quantity_unit, '')));
  v_total_quantity_unit text := lower(trim(coalesce(p_total_quantity_unit, '')));
  v_unit_price_unit text := lower(trim(coalesce(p_unit_price_unit, '')));
  v_mentions_bloc boolean := position('bloc' in v_format) > 0;
  v_mentions_piece boolean := position('piece' in v_format) > 0 or position('unite' in v_format) > 0;
begin
  if v_quantity_unit <> '' and not (v_quantity_unit = any(v_allowed_units)) then
    return format('quantity_unit unsupported: %s', p_quantity_unit);
  end if;

  if v_total_quantity_unit <> '' and not (v_total_quantity_unit = any(v_allowed_units)) then
    return format('total_quantity_unit unsupported: %s', p_total_quantity_unit);
  end if;

  if v_unit_price_unit <> '' and not (v_unit_price_unit = any(v_allowed_units)) then
    return format('unit_price_unit unsupported: %s', p_unit_price_unit);
  end if;

  if p_quantity_value is not null and v_quantity_unit = '' then
    return 'quantity_value requires quantity_unit';
  end if;

  if p_total_quantity_value is not null and v_total_quantity_unit = '' then
    return 'total_quantity_value requires total_quantity_unit';
  end if;

  if p_unit_price is not null and p_unit_price > 0 and v_unit_price_unit = '' then
    return 'unit_price requires unit_price_unit';
  end if;

  if p_pack_count is not null and p_pack_count <= 0 then
    return 'pack_count must be strictly positive when provided';
  end if;

  if v_mentions_bloc then
    if v_quantity_unit in ('kg', 'g', 'l', 'cl', 'ml')
       or v_total_quantity_unit in ('kg', 'g', 'l', 'cl', 'ml') then
      return 'package_format bloc(s) cannot keep quantity fields in volume or weight units';
    end if;

    if v_unit_price_unit <> '' and v_unit_price_unit <> 'bloc' then
      return 'package_format bloc(s) requires unit_price_unit bloc';
    end if;
  end if;

  if v_mentions_piece then
    if v_quantity_unit in ('kg', 'g', 'l', 'cl', 'ml')
       or v_total_quantity_unit in ('kg', 'g', 'l', 'cl', 'ml') then
      return 'package_format piece(s) or unite(s) cannot keep quantity fields in volume or weight units';
    end if;

    if v_unit_price_unit <> '' and v_unit_price_unit not in ('piece', 'unite') then
      return 'package_format piece(s) or unite(s) requires unit_price_unit piece or unite';
    end if;
  end if;

  if p_pack_count is not null
     and p_pack_count > 1
     and p_unit_price is not null
     and p_unit_price > 0
     and v_unit_price_unit in ('kg', 'g', 'l', 'cl', 'ml')
     and (v_mentions_bloc or v_mentions_piece) then
    return 'lot unit_price_unit must stay coherent with the lot unit';
  end if;

  return null;
end;
$$;

create or replace function public.retail_price_candidates_apply_review_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean := public.good_deals_is_admin();
  v_match_changed boolean := false;
  v_quantity_contract_error text;
begin
  new.updated_at := now();
  new.review_notes := nullif(btrim(coalesce(new.review_notes, '')), '');
  new.match_warnings := coalesce(new.match_warnings, '[]'::jsonb);
  new.validation_errors := coalesce(new.validation_errors, '[]'::jsonb);

  if jsonb_typeof(new.match_warnings) <> 'array' then
    raise exception 'match_warnings must stay a JSON array' using errcode = '22000';
  end if;

  if jsonb_typeof(new.validation_errors) <> 'array' then
    raise exception 'validation_errors must stay a JSON array' using errcode = '22000';
  end if;

  v_match_changed := (
    new.matched_market_product_id is distinct from old.matched_market_product_id
    or new.matched_shopping_product_id is distinct from old.matched_shopping_product_id
    or new.match_method is distinct from old.match_method
    or new.match_confidence is distinct from old.match_confidence
  );

  if old.status = 'published' and v_match_changed then
    raise exception 'published retail candidates cannot change matching fields without an explicit procedure'
      using errcode = '42501';
  end if;

  if v_is_admin and (
    new.product_name is distinct from old.product_name
    or new.brand is distinct from old.brand
    or new.package_format is distinct from old.package_format
    or new.quantity_value is distinct from old.quantity_value
    or new.quantity_unit is distinct from old.quantity_unit
    or new.pack_count is distinct from old.pack_count
    or new.total_quantity_value is distinct from old.total_quantity_value
    or new.total_quantity_unit is distinct from old.total_quantity_unit
    or new.current_price is distinct from old.current_price
    or new.original_price is distinct from old.original_price
    or new.unit_price is distinct from old.unit_price
    or new.unit_price_unit is distinct from old.unit_price_unit
    or new.status is distinct from old.status
    or v_match_changed
    or new.review_notes is distinct from old.review_notes
  ) then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;

  v_quantity_contract_error := public.retail_quantity_contract_error(
    new.package_format,
    new.quantity_value,
    new.quantity_unit,
    new.pack_count,
    new.total_quantity_value,
    new.total_quantity_unit,
    new.unit_price,
    new.unit_price_unit
  );

  if v_quantity_contract_error is not null then
    raise exception 'retail quantity contract invalid: %', v_quantity_contract_error using errcode = '22000';
  end if;

  if new.status in ('approved_price', 'approved_promotion', 'published')
     and new.matched_market_product_id is null then
    raise exception 'approved retail candidates require matched_market_product_id' using errcode = '22000';
  end if;

  if new.status = 'approved_promotion' and new.promotion_proven is not true then
    raise exception 'approved_promotion requires an explicit proven promotion' using errcode = '22000';
  end if;

  if new.status = 'approved_price' and new.current_price <= 0 then
    raise exception 'approved_price requires a strictly positive current_price' using errcode = '22000';
  end if;

  if new.status = 'published' and new.price_type not in ('observed_price', 'promotion') then
    raise exception 'published retail candidates must be observed_price or promotion' using errcode = '22000';
  end if;

  if new.status = 'published' and new.published_price_observation_id is null then
    raise exception 'published retail candidates require published_price_observation_id' using errcode = '22000';
  end if;

  if new.status = 'published' and new.published_market_observation_id is null then
    raise exception 'published retail candidates require published_market_observation_id' using errcode = '22000';
  end if;

  if new.status = 'published'
     and new.price_type = 'promotion'
     and new.published_promotion_id is null then
    raise exception 'published retail promotions require published_promotion_id' using errcode = '22000';
  end if;

  return new;
end;
$$;

create or replace function public.retail_upsert_price_observation(
  p_candidate_id uuid,
  p_market_product_id uuid,
  p_shopping_product_id uuid default null,
  p_promotion_id uuid default null
)
returns table (
  observation_id uuid,
  action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_quantity_contract_error text;
begin
  select *
  into v_candidate
  from public.retail_price_candidates
  where id = p_candidate_id;

  if not found then
    raise exception 'retail price candidate not found: %', p_candidate_id using errcode = 'P0002';
  end if;

  v_quantity_contract_error := public.retail_quantity_contract_error(
    v_candidate.package_format,
    v_candidate.quantity_value,
    v_candidate.quantity_unit,
    v_candidate.pack_count,
    v_candidate.total_quantity_value,
    v_candidate.total_quantity_unit,
    v_candidate.unit_price,
    v_candidate.unit_price_unit
  );

  if v_quantity_contract_error is not null then
    raise exception 'retail publication refused: %', v_quantity_contract_error using errcode = '22000';
  end if;

  return query
  with existing as (
    select observations.id
    from public.retail_price_observations as observations
    where observations.market_product_id = p_market_product_id
      and observations.retailer_slug = v_candidate.retailer_slug
      and observations.store_slug = v_candidate.store_slug
      and observations.channel = v_candidate.channel
      and observations.price = v_candidate.current_price
      and coalesce(observations.unit_price, -1) = coalesce(v_candidate.unit_price, -1)
      and coalesce(observations.unit_price_unit, '') = coalesce(v_candidate.unit_price_unit, '')
      and observations.currency = v_candidate.currency
      and observations.price_type = v_candidate.price_type
      and observations.promotion_proven = v_candidate.promotion_proven
      and coalesce(observations.original_price, -1) = coalesce(v_candidate.original_price, -1)
      and coalesce(observations.offer_mechanism, '') = coalesce(v_candidate.offer_mechanism, '')
    order by observations.last_seen_at desc
    limit 1
    for update
  ),
  updated as (
    update public.retail_price_observations as observations
    set
      shopping_product_id = coalesce(p_shopping_product_id, observations.shopping_product_id),
      promotion_id = coalesce(p_promotion_id, observations.promotion_id),
      observed_at = greatest(observations.observed_at, v_candidate.source_observed_at),
      last_seen_at = greatest(observations.last_seen_at, v_candidate.source_observed_at),
      source_url = v_candidate.source_url,
      source_confidence = least(greatest(coalesce(v_candidate.match_confidence, 0), 0), 1),
      updated_at = now()
    where observations.id in (select existing.id from existing)
    returning observations.id
  ),
  inserted as (
    insert into public.retail_price_observations (
      market_product_id,
      shopping_product_id,
      retailer_slug,
      store_slug,
      store_name,
      store_city,
      source_type,
      source_product_id,
      channel,
      price,
      unit_price,
      unit_price_unit,
      currency,
      price_type,
      promotion_proven,
      original_price,
      offer_mechanism,
      observed_at,
      first_seen_at,
      last_seen_at,
      source_url,
      source_confidence,
      candidate_id,
      promotion_id,
      created_at,
      updated_at
    )
    select
      p_market_product_id,
      p_shopping_product_id,
      v_candidate.retailer_slug,
      v_candidate.store_slug,
      v_candidate.store_name,
      v_candidate.store_city,
      v_candidate.source_type,
      v_candidate.source_product_id,
      v_candidate.channel,
      v_candidate.current_price,
      v_candidate.unit_price,
      v_candidate.unit_price_unit,
      v_candidate.currency,
      v_candidate.price_type,
      v_candidate.promotion_proven,
      v_candidate.original_price,
      v_candidate.offer_mechanism,
      v_candidate.source_observed_at,
      coalesce(v_candidate.first_seen_at, v_candidate.source_observed_at),
      greatest(v_candidate.last_seen_at, v_candidate.source_observed_at),
      v_candidate.source_url,
      least(greatest(coalesce(v_candidate.match_confidence, 0), 0), 1),
      v_candidate.id,
      p_promotion_id,
      now(),
      now()
    where not exists (select 1 from existing)
    returning id
  )
  select updated.id, 'updated'::text from updated
  union all
  select inserted.id, 'created'::text from inserted;
end;
$$;

alter function public.retail_upsert_price_observation(uuid, uuid, uuid, uuid) owner to postgres;
revoke all on function public.retail_upsert_price_observation(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.retail_upsert_price_observation(uuid, uuid, uuid, uuid) to postgres, service_role;

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
  v_quantity_contract_error text;
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

  v_quantity_contract_error := public.retail_quantity_contract_error(
    v_candidate.package_format,
    v_candidate.quantity_value,
    v_candidate.quantity_unit,
    v_candidate.pack_count,
    v_candidate.total_quantity_value,
    v_candidate.total_quantity_unit,
    v_candidate.unit_price,
    v_candidate.unit_price_unit
  );

  if v_quantity_contract_error is not null then
    raise exception 'retail market sync refused: %', v_quantity_contract_error using errcode = '22000';
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

do $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_retail_observation public.retail_price_observations%rowtype;
  v_market_observation public.market_price_observations%rowtype;
begin
  select *
  into v_candidate
  from public.retail_price_candidates
  where id = '2d4f7a3a-cdb3-4698-9da7-bed74cbd2a7c'
  for update;

  if not found then
    raise exception 'Harpic candidate not found: 2d4f7a3a-cdb3-4698-9da7-bed74cbd2a7c';
  end if;

  if v_candidate.published_price_observation_id is null
     or v_candidate.published_market_observation_id is null then
    raise exception 'Harpic candidate is missing linked published observations';
  end if;

  if v_candidate.current_price is distinct from 3.12
     or v_candidate.unit_price is distinct from 1.56 then
    raise exception 'Harpic candidate pricing drifted unexpectedly';
  end if;

  select *
  into v_retail_observation
  from public.retail_price_observations
  where id = v_candidate.published_price_observation_id
    and candidate_id = v_candidate.id
  for update;

  if not found then
    raise exception 'Harpic retail_price_observation does not match the published_price_observation_id';
  end if;

  if v_retail_observation.price is distinct from 3.12
     or v_retail_observation.unit_price is distinct from 1.56 then
    raise exception 'Harpic retail_price_observation pricing drifted unexpectedly';
  end if;

  select *
  into v_market_observation
  from public.market_price_observations
  where id = v_candidate.published_market_observation_id
    and source = 'retail_publication'
  for update;

  if not found then
    raise exception 'Harpic market_price_observation does not match the published_market_observation_id';
  end if;

  if v_market_observation.price is distinct from 3.12
     or v_market_observation.unit_price is distinct from 1.56 then
    raise exception 'Harpic market_price_observation pricing drifted unexpectedly';
  end if;

  update public.retail_price_candidates
  set
    package_format = '2 blocs',
    quantity_value = null,
    quantity_unit = null,
    pack_count = null,
    total_quantity_value = null,
    total_quantity_unit = null,
    unit_price = 1.56,
    unit_price_unit = 'bloc',
    updated_at = now()
  where id = v_candidate.id;

  update public.retail_price_observations
  set
    unit_price = 1.56,
    unit_price_unit = 'bloc',
    updated_at = now()
  where id = v_candidate.published_price_observation_id;

  update public.market_price_observations
  set
    unit_price = 1.56,
    unit_type = 'bloc'
  where id = v_candidate.published_market_observation_id;
end;
$$;
