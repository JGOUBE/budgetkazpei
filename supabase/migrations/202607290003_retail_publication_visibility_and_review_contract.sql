begin;

do $$
declare
  required_table text;
  required_tables text[] := array[
    'public.good_deals',
    'public.good_deal_businesses',
    'public.market_stores',
    'public.market_products',
    'public.market_seed_batches',
    'public.market_price_observations',
    'public.retail_price_candidates',
    'public.retail_price_observations',
    'public.shopping_products',
    'public.shopping_promotions',
    'public.shopping_catalogs',
    'public.shopping_store_locations'
  ];
begin
  foreach required_table in array required_tables loop
    if to_regclass(required_table) is null then
      raise exception 'Migration 202607290003_retail_publication_visibility_and_review_contract requires table % to exist before execution.', required_table;
    end if;
  end loop;

  if to_regprocedure('public.good_deals_is_admin()') is null then
    raise exception 'Migration 202607290003_retail_publication_visibility_and_review_contract requires public.good_deals_is_admin() to exist before execution.';
  end if;

  if to_regprocedure('public.market_normalize_text(text)') is null then
    raise exception 'Migration 202607290003_retail_publication_visibility_and_review_contract requires public.market_normalize_text(text) to exist before execution.';
  end if;

  if to_regprocedure('public.market_store_chain_key(text)') is null then
    raise exception 'Migration 202607290003_retail_publication_visibility_and_review_contract requires public.market_store_chain_key(text) to exist before execution.';
  end if;
end $$;

alter table public.retail_price_candidates
  add column if not exists published_market_observation_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_published_market_observation_id_fkey'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_published_market_observation_id_fkey
      foreign key (published_market_observation_id)
      references public.market_price_observations(id)
      on delete set null;
  end if;
end $$;

create index if not exists retail_price_candidates_published_market_observation_idx
  on public.retail_price_candidates (published_market_observation_id)
  where published_market_observation_id is not null;

alter table public.market_price_observations
  drop constraint if exists market_price_observations_source_valid;

alter table public.market_price_observations
  add constraint market_price_observations_source_valid
  check (source in ('manual_seed', 'receipt_scan_anonymized', 'open_prices', 'retail_publication'));

create table if not exists public.retail_market_store_mappings (
  id uuid primary key default gen_random_uuid(),
  retailer_slug text not null,
  store_slug text not null,
  market_store_id uuid not null references public.market_stores(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint retail_market_store_mappings_retailer_store_unique unique (retailer_slug, store_slug)
);

create index if not exists retail_market_store_mappings_market_store_idx
  on public.retail_market_store_mappings (market_store_id);

create or replace function public.retail_market_store_mappings_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists retail_market_store_mappings_set_updated_at
  on public.retail_market_store_mappings;

create trigger retail_market_store_mappings_set_updated_at
before update on public.retail_market_store_mappings
for each row
execute function public.retail_market_store_mappings_set_updated_at();

insert into public.retail_market_store_mappings (
  retailer_slug,
  store_slug,
  market_store_id
)
values (
  'leader-price-reunion',
  'leaderprice-lp-ermitage',
  '29ae25ce-eb77-4d8e-9f88-0b4b5c5b4eb3'
)
on conflict (retailer_slug, store_slug) do update
set market_store_id = excluded.market_store_id;

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

  select id
  into v_existing_id
  from public.market_price_observations
  where batch_id = v_batch_id
    and batch_item_key = v_batch_item_key
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

create or replace function public.retail_price_candidates_apply_review_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean := public.good_deals_is_admin();
  v_match_changed boolean := false;
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
    or new.current_price is distinct from old.current_price
    or new.original_price is distinct from old.original_price
    or new.unit_price is distinct from old.unit_price
    or new.status is distinct from old.status
    or v_match_changed
    or new.review_notes is distinct from old.review_notes
  ) then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
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

create or replace function public.retail_publish_price_candidates(p_candidate_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_candidate_id uuid;
  v_candidate public.retail_price_candidates%rowtype;
  v_retail_result record;
  v_market_result record;
  v_market_store_id uuid;
  v_created_ids uuid[] := '{}'::uuid[];
  v_updated_ids uuid[] := '{}'::uuid[];
  v_market_created_ids uuid[] := '{}'::uuid[];
  v_market_updated_ids uuid[] := '{}'::uuid[];
  v_ignored_ids uuid[] := '{}'::uuid[];
begin
  if p_candidate_ids is null or array_length(p_candidate_ids, 1) is null then
    raise exception 'candidate ids are required' using errcode = '22023';
  end if;

  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'retail price publication requires an administrator account' using errcode = '42501';
  end if;

  foreach v_candidate_id in array p_candidate_ids loop
    select *
    into v_candidate
    from public.retail_price_candidates
    where id = v_candidate_id
    for update;

    if not found then
      raise exception 'retail price candidate not found: %', v_candidate_id using errcode = 'P0002';
    end if;

    if v_candidate.status = 'published' then
      if v_candidate.published_price_observation_id is null
         or v_candidate.published_market_observation_id is null then
        raise exception 'published retail candidate is missing publication links: %', v_candidate.id
          using errcode = '22000';
      end if;

      v_ignored_ids := array_append(v_ignored_ids, v_candidate.id);
      continue;
    end if;

    if v_candidate.status <> 'approved_price' then
      raise exception 'retail observed price candidate must be approved_price before publication: %', v_candidate.id
        using errcode = '22000';
    end if;

    if v_candidate.matched_market_product_id is null or v_candidate.current_price <= 0 then
      raise exception 'retail observed price candidate is missing publication requirements: %', v_candidate.id
        using errcode = '22000';
    end if;

    v_market_store_id := public.retail_resolve_market_store(v_candidate.id);

    select *
    into v_retail_result
    from public.retail_upsert_price_observation(
      v_candidate.id,
      v_candidate.matched_market_product_id,
      v_candidate.matched_shopping_product_id,
      null
    );

    if not found or v_retail_result.observation_id is null then
      raise exception 'retail publication failed to persist the retail observation for candidate %', v_candidate.id
        using errcode = '22000';
    end if;

    select *
    into v_market_result
    from public.retail_sync_market_price_observation(
      v_candidate.id,
      v_retail_result.observation_id,
      v_market_store_id,
      null
    );

    if not found or v_market_result.observation_id is null then
      raise exception 'retail publication failed to persist the market observation for candidate %', v_candidate.id
        using errcode = '22000';
    end if;

    if v_retail_result.action = 'created' then
      v_created_ids := array_append(v_created_ids, v_retail_result.observation_id);
    else
      v_updated_ids := array_append(v_updated_ids, v_retail_result.observation_id);
    end if;

    if v_market_result.action = 'created' then
      v_market_created_ids := array_append(v_market_created_ids, v_market_result.observation_id);
    else
      v_market_updated_ids := array_append(v_market_updated_ids, v_market_result.observation_id);
    end if;

    update public.retail_price_candidates
    set
      status = 'published',
      published_price_observation_id = v_retail_result.observation_id,
      published_market_observation_id = v_market_result.observation_id,
      last_seen_at = greatest(last_seen_at, source_observed_at),
      updated_at = now()
    where id = v_candidate.id;
  end loop;

  return jsonb_build_object(
    'created', to_jsonb(coalesce(v_created_ids, '{}'::uuid[])),
    'updated', to_jsonb(coalesce(v_updated_ids, '{}'::uuid[])),
    'market_created', to_jsonb(coalesce(v_market_created_ids, '{}'::uuid[])),
    'market_updated', to_jsonb(coalesce(v_market_updated_ids, '{}'::uuid[])),
    'ignored', to_jsonb(coalesce(v_ignored_ids, '{}'::uuid[])),
    'rejected', '[]'::jsonb
  );
end;
$$;

alter function public.retail_publish_price_candidates(uuid[]) owner to postgres;
revoke all on function public.retail_publish_price_candidates(uuid[]) from public, anon;
grant execute on function public.retail_publish_price_candidates(uuid[]) to authenticated, service_role, postgres;

create or replace function public.retail_publish_promotion_candidates(p_candidate_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_candidate_id uuid;
  v_candidate public.retail_price_candidates%rowtype;
  v_retail_result record;
  v_market_result record;
  v_market_store_id uuid;
  v_store_location_id uuid;
  v_catalog_id uuid;
  v_shopping_product_id uuid;
  v_promotion_id uuid;
  v_observed_at_day text;
  v_created_ids uuid[] := '{}'::uuid[];
  v_updated_ids uuid[] := '{}'::uuid[];
  v_market_created_ids uuid[] := '{}'::uuid[];
  v_market_updated_ids uuid[] := '{}'::uuid[];
  v_ignored_ids uuid[] := '{}'::uuid[];
begin
  if p_candidate_ids is null or array_length(p_candidate_ids, 1) is null then
    raise exception 'candidate ids are required' using errcode = '22023';
  end if;

  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'retail promotion publication requires an administrator account' using errcode = '42501';
  end if;

  foreach v_candidate_id in array p_candidate_ids loop
    select *
    into v_candidate
    from public.retail_price_candidates
    where id = v_candidate_id
    for update;

    if not found then
      raise exception 'retail price candidate not found: %', v_candidate_id using errcode = 'P0002';
    end if;

    if v_candidate.status = 'published' then
      if v_candidate.published_price_observation_id is null
         or v_candidate.published_promotion_id is null
         or v_candidate.published_market_observation_id is null then
        raise exception 'published retail promotion candidate is missing publication links: %', v_candidate.id
          using errcode = '22000';
      end if;

      v_ignored_ids := array_append(v_ignored_ids, v_candidate.id);
      continue;
    end if;

    if v_candidate.status <> 'approved_promotion'
       or v_candidate.promotion_proven is not true
       or v_candidate.promotion_evidence is null
       or v_candidate.current_price <= 0
       or v_candidate.matched_market_product_id is null then
      raise exception 'retail promotion candidate is missing publication requirements: %', v_candidate.id
        using errcode = '22000';
    end if;

    v_market_store_id := public.retail_resolve_market_store(v_candidate.id);
    v_shopping_product_id := public.retail_resolve_or_create_shopping_product(v_candidate.id);

    select id
    into v_store_location_id
    from public.shopping_store_locations
    where retailer_slug is not distinct from v_candidate.retailer_slug
      and store_name is not distinct from v_candidate.store_name
      and commune is not distinct from coalesce(v_candidate.store_city, v_candidate.store_name)
    limit 1;

    if v_store_location_id is null then
      insert into public.shopping_store_locations (
        retailer_slug,
        retailer_name,
        store_name,
        commune,
        locality,
        website_url,
        is_active,
        updated_at
      )
      values (
        v_candidate.retailer_slug,
        v_candidate.retailer_name,
        v_candidate.store_name,
        coalesce(v_candidate.store_city, v_candidate.store_name),
        v_candidate.store_city,
        v_candidate.source_url,
        true,
        now()
      )
      returning id into v_store_location_id;
    else
      update public.shopping_store_locations
      set
        retailer_name = v_candidate.retailer_name,
        locality = v_candidate.store_city,
        website_url = v_candidate.source_url,
        is_active = true,
        updated_at = now()
      where id = v_store_location_id;
    end if;

    v_observed_at_day := to_char(v_candidate.source_observed_at at time zone 'UTC', 'YYYY-MM-DD');

    select id
    into v_catalog_id
    from public.shopping_catalogs
    where collector_source_slug = 'leader-price-reunion-retail'
      and external_key = format('retail-run:%s:%s', v_candidate.source_run_id, v_candidate.store_slug)
    limit 1;

    if v_catalog_id is null then
      insert into public.shopping_catalogs (
        external_key,
        collector_source_slug,
        retailer_slug,
        retailer_name,
        title,
        description,
        scope_type,
        commune,
        micro_region,
        store_location_id,
        starts_at,
        ends_at,
        source_url,
        source_kind,
        verification_status,
        is_featured,
        is_active,
        updated_at
      )
      values (
        format('retail-run:%s:%s', v_candidate.source_run_id, v_candidate.store_slug),
        'leader-price-reunion-retail',
        v_candidate.retailer_slug,
        v_candidate.retailer_name,
        format('Leader Price - %s - promotions observees le %s', v_candidate.store_name, v_observed_at_day),
        format('Collecte structuree Leader Price %s pour %s.', v_candidate.store_name, v_observed_at_day),
        'store',
        coalesce(v_candidate.store_city, v_candidate.store_name),
        null,
        v_store_location_id,
        v_candidate.starts_at,
        v_candidate.ends_at,
        v_candidate.source_url,
        'collector',
        'published',
        false,
        true,
        now()
      )
      returning id into v_catalog_id;
    else
      update public.shopping_catalogs
      set
        retailer_slug = v_candidate.retailer_slug,
        retailer_name = v_candidate.retailer_name,
        title = format('Leader Price - %s - promotions observees le %s', v_candidate.store_name, v_observed_at_day),
        description = format('Collecte structuree Leader Price %s pour %s.', v_candidate.store_name, v_observed_at_day),
        store_location_id = v_store_location_id,
        starts_at = v_candidate.starts_at,
        ends_at = v_candidate.ends_at,
        source_url = v_candidate.source_url,
        source_kind = 'collector',
        verification_status = 'published',
        is_featured = false,
        is_active = true,
        updated_at = now()
      where id = v_catalog_id;
    end if;

    select id
    into v_promotion_id
    from public.shopping_promotions
    where collector_source_slug = 'leader-price-reunion-retail'
      and external_key = format('retail-promo:%s', v_candidate.id)
    limit 1;

    if v_promotion_id is null then
      insert into public.shopping_promotions (
        external_key,
        collector_source_slug,
        catalog_id,
        product_id,
        store_location_id,
        retailer_slug,
        title,
        offer_text,
        promo_price,
        original_price,
        discount_percent,
        unit_price,
        unit_label,
        conditions,
        starts_at,
        ends_at,
        source_url,
        source_page,
        verification_status,
        is_featured,
        is_active,
        updated_at
      )
      values (
        format('retail-promo:%s', v_candidate.id),
        'leader-price-reunion-retail',
        v_catalog_id,
        v_shopping_product_id,
        v_store_location_id,
        v_candidate.retailer_slug,
        v_candidate.product_name,
        coalesce(v_candidate.promo_badge, v_candidate.conditions, 'Promotion structuree'),
        v_candidate.current_price,
        v_candidate.original_price,
        v_candidate.discount_percent,
        v_candidate.unit_price,
        v_candidate.unit_price_unit,
        v_candidate.conditions,
        v_candidate.starts_at,
        v_candidate.ends_at,
        v_candidate.source_url,
        v_candidate.product_url,
        'published',
        false,
        true,
        now()
      )
      returning id into v_promotion_id;
      v_created_ids := array_append(v_created_ids, v_promotion_id);
    else
      update public.shopping_promotions
      set
        catalog_id = v_catalog_id,
        product_id = v_shopping_product_id,
        store_location_id = v_store_location_id,
        retailer_slug = v_candidate.retailer_slug,
        title = v_candidate.product_name,
        offer_text = coalesce(v_candidate.promo_badge, v_candidate.conditions, 'Promotion structuree'),
        promo_price = v_candidate.current_price,
        original_price = v_candidate.original_price,
        discount_percent = v_candidate.discount_percent,
        unit_price = v_candidate.unit_price,
        unit_label = v_candidate.unit_price_unit,
        conditions = v_candidate.conditions,
        starts_at = v_candidate.starts_at,
        ends_at = v_candidate.ends_at,
        source_url = v_candidate.source_url,
        source_page = v_candidate.product_url,
        verification_status = 'published',
        is_featured = false,
        is_active = true,
        updated_at = now()
      where id = v_promotion_id;
      v_updated_ids := array_append(v_updated_ids, v_promotion_id);
    end if;

    select *
    into v_retail_result
    from public.retail_upsert_price_observation(
      v_candidate.id,
      v_candidate.matched_market_product_id,
      v_shopping_product_id,
      v_promotion_id
    );

    if not found or v_retail_result.observation_id is null then
      raise exception 'retail promotion publication failed to persist the retail observation for candidate %', v_candidate.id
        using errcode = '22000';
    end if;

    select *
    into v_market_result
    from public.retail_sync_market_price_observation(
      v_candidate.id,
      v_retail_result.observation_id,
      v_market_store_id,
      v_promotion_id
    );

    if not found or v_market_result.observation_id is null then
      raise exception 'retail promotion publication failed to persist the market observation for candidate %', v_candidate.id
        using errcode = '22000';
    end if;

    if v_market_result.action = 'created' then
      v_market_created_ids := array_append(v_market_created_ids, v_market_result.observation_id);
    else
      v_market_updated_ids := array_append(v_market_updated_ids, v_market_result.observation_id);
    end if;

    update public.retail_price_candidates
    set
      status = 'published',
      matched_shopping_product_id = v_shopping_product_id,
      published_price_observation_id = v_retail_result.observation_id,
      published_promotion_id = v_promotion_id,
      published_market_observation_id = v_market_result.observation_id,
      last_seen_at = greatest(last_seen_at, source_observed_at),
      updated_at = now()
    where id = v_candidate.id;
  end loop;

  return jsonb_build_object(
    'created', to_jsonb(coalesce(v_created_ids, '{}'::uuid[])),
    'updated', to_jsonb(coalesce(v_updated_ids, '{}'::uuid[])),
    'market_created', to_jsonb(coalesce(v_market_created_ids, '{}'::uuid[])),
    'market_updated', to_jsonb(coalesce(v_market_updated_ids, '{}'::uuid[])),
    'ignored', to_jsonb(coalesce(v_ignored_ids, '{}'::uuid[])),
    'rejected', '[]'::jsonb
  );
end;
$$;

alter function public.retail_publish_promotion_candidates(uuid[]) owner to postgres;
revoke all on function public.retail_publish_promotion_candidates(uuid[]) from public, anon;
grant execute on function public.retail_publish_promotion_candidates(uuid[]) to authenticated, service_role, postgres;

create or replace view public.retail_price_candidates_review
with (security_invoker = true)
as
select
  candidates.id,
  candidates.source_run_id,
  candidates.source_type,
  candidates.source_product_id,
  candidates.source_url,
  candidates.source_observed_at,
  candidates.retailer_slug,
  candidates.retailer_name,
  candidates.store_slug,
  candidates.store_name,
  candidates.store_city,
  candidates.channel,
  candidates.source_category,
  candidates.source_subcategory,
  candidates.raw_product_name,
  candidates.product_name,
  candidates.normalized_product_name,
  candidates.brand,
  candidates.package_format,
  candidates.quantity_value,
  candidates.quantity_unit,
  candidates.pack_count,
  candidates.total_quantity_value,
  candidates.total_quantity_unit,
  candidates.barcode,
  candidates.image_url,
  candidates.product_url,
  candidates.current_price,
  candidates.original_price,
  candidates.unit_price,
  candidates.unit_price_unit,
  candidates.currency,
  candidates.price_type,
  candidates.promotion_proven,
  candidates.promotion_evidence,
  candidates.promo_badge,
  candidates.discount_percent,
  candidates.loyalty_amount,
  candidates.loyalty_type,
  candidates.offer_mechanism,
  candidates.conditions,
  candidates.starts_at,
  candidates.ends_at,
  candidates.matched_market_product_id,
  market_products.canonical_name as matched_market_product_name,
  market_products.brand as matched_market_product_brand,
  market_products.product_key as matched_market_product_key,
  candidates.matched_shopping_product_id,
  shopping_products.display_name as matched_shopping_product_name,
  candidates.match_method,
  candidates.match_confidence,
  candidates.match_warnings,
  candidates.status,
  candidates.validation_errors,
  candidates.review_notes,
  candidates.reviewed_by,
  candidates.reviewed_at,
  candidates.published_price_observation_id,
  candidates.published_promotion_id,
  candidates.duplicate_key,
  candidates.extraction_confidence,
  candidates.first_seen_at,
  candidates.last_seen_at,
  candidates.created_at,
  candidates.updated_at,
  candidates.published_market_observation_id
from public.retail_price_candidates as candidates
left join public.market_products
  on market_products.id = candidates.matched_market_product_id
left join public.shopping_products
  on shopping_products.id = candidates.matched_shopping_product_id;

create or replace view public.published_good_deals
as
with base_good_deals as (
  select
    gd.id,
    gd.business_id,
    gd.title,
    gd.description,
    gd.conditions,
    gd.category,
    gd.scope_type::text as scope_type,
    gd.commune,
    gd.micro_region,
    gd.radius_km,
    gd.starts_at,
    gd.ends_at,
    gd.source_url,
    gd.contact_url,
    gd.is_sponsored,
    gd.is_featured,
    gd.created_at,
    gd.updated_at,
    b.name as business_name,
    b.description as business_description,
    b.address as business_address,
    b.commune as business_commune,
    b.postal_code as business_postal_code,
    b.latitude as business_latitude,
    b.longitude as business_longitude,
    b.phone as business_phone,
    b.website_url as business_website_url,
    b.social_url as business_social_url,
    b.logo_url as business_logo_url,
    b.is_verified as business_is_verified,
    b.is_partner as business_is_partner,
    gd.deal_type::text as deal_type,
    gd.tags,
    gd.is_free,
    gd.price_note,
    gd.content_kind::text as content_kind,
    gd.locality,
    gd.territory_name,
    gd.opening_hours_note,
    gd.booking_required,
    gd.minimum_age,
    gd.audience,
    gd.availability_status::text as availability_status,
    gd.last_verified_at,
    gd.verification_due_at,
    gd.access_warning
  from public.good_deals gd
  left join public.good_deal_businesses b on b.id = gd.business_id
  where gd.is_active = true
    and gd.verification_status = 'published'::good_deal_verification_status
    and (gd.ends_at is null or gd.ends_at >= now())
    and gd.source_still_available is not false
    and coalesce(gd.availability_status, 'active') <> 'expired'
    and (b.id is null or b.is_active = true)
),
retail_promotions as (
  select
    promotions.id,
    null::uuid as business_id,
    coalesce(promotions.title, shopping_products.display_name, retail_candidates.product_name, 'Promotion retail') as title,
    coalesce(promotions.offer_text, promotions.conditions, retail_candidates.product_name, 'Promotion retail structuree') as description,
    promotions.conditions,
    'shopping'::text as category,
    coalesce(catalogs.scope_type::text, 'commune') as scope_type,
    coalesce(catalogs.commune, stores.commune, retail_candidates.store_city, retail_candidates.store_name) as commune,
    catalogs.micro_region,
    null::numeric as radius_km,
    promotions.starts_at,
    promotions.ends_at,
    coalesce(promotions.source_url, catalogs.source_url) as source_url,
    null::text as contact_url,
    false as is_sponsored,
    coalesce(promotions.is_featured, false) as is_featured,
    promotions.created_at,
    promotions.updated_at,
    coalesce(catalogs.retailer_name, retail_candidates.retailer_name, initcap(replace(promotions.retailer_slug, '-', ' '))) as business_name,
    null::text as business_description,
    null::text as business_address,
    stores.commune as business_commune,
    null::text as business_postal_code,
    null::numeric as business_latitude,
    null::numeric as business_longitude,
    null::text as business_phone,
    stores.website_url as business_website_url,
    null::text as business_social_url,
    null::text as business_logo_url,
    false as business_is_verified,
    false as business_is_partner,
    null::text as deal_type,
    array['product_promo']::text[] as tags,
    false as is_free,
    concat_ws(
      ' - ',
      concat('Prix promo ', trim(to_char(promotions.promo_price, 'FM999999990D00')), ' EUR'),
      case
        when promotions.original_price is not null
          then concat('Au lieu de ', trim(to_char(promotions.original_price, 'FM999999990D00')), ' EUR')
        else null
      end,
      case
        when promotions.unit_price is not null and nullif(promotions.unit_label, '') is not null
          then concat(trim(to_char(promotions.unit_price, 'FM999999990D00')), ' EUR/', promotions.unit_label)
        else null
      end
    ) as price_note,
    'promotion'::text as content_kind,
    coalesce(stores.store_name, retail_candidates.store_name) as locality,
    null::text as territory_name,
    null::text as opening_hours_note,
    null::boolean as booking_required,
    null::integer as minimum_age,
    null::text as audience,
    'active'::text as availability_status,
    coalesce(promotions.updated_at, promotions.starts_at, catalogs.updated_at) as last_verified_at,
    promotions.ends_at as verification_due_at,
    null::text as access_warning
  from public.shopping_promotions promotions
  join public.retail_price_candidates retail_candidates
    on retail_candidates.published_promotion_id = promotions.id
   and retail_candidates.status = 'published'
   and retail_candidates.price_type = 'promotion'
   and retail_candidates.matched_market_product_id is not null
   and retail_candidates.published_price_observation_id is not null
   and retail_candidates.published_market_observation_id is not null
  left join public.shopping_catalogs catalogs
    on catalogs.id = promotions.catalog_id
  left join public.shopping_store_locations stores
    on stores.id = promotions.store_location_id
  left join public.shopping_products shopping_products
    on shopping_products.id = promotions.product_id
  where promotions.collector_source_slug = 'leader-price-reunion-retail'
    and promotions.verification_status = 'published'
    and coalesce(promotions.is_active, true) = true
    and (promotions.ends_at is null or promotions.ends_at >= now())
    and not exists (
      select 1
      from public.good_deals gd
      where gd.collector_source_slug = promotions.collector_source_slug
        and gd.external_key = promotions.external_key
        and gd.is_active = true
        and gd.verification_status = 'published'::good_deal_verification_status
    )
),
retail_observed_prices as (
  select
    observations.id,
    null::uuid as business_id,
    coalesce(shopping_products.display_name, retail_candidates.product_name, market_products.canonical_name, 'Prix observe retail') as title,
    concat_ws(
      ' - ',
      nullif(
        concat_ws(
          ' · ',
          nullif(retail_candidates.brand, ''),
          nullif(retail_candidates.package_format, '')
        ),
        ''
      ),
      concat('Prix observe le ', to_char(observations.observed_at at time zone 'Indian/Reunion', 'DD/MM/YYYY'))
    ) as description,
    observations.offer_mechanism as conditions,
    'shopping'::text as category,
    'commune'::text as scope_type,
    coalesce(observations.store_city, retail_candidates.store_city, observations.store_name) as commune,
    null::text as micro_region,
    null::numeric as radius_km,
    null::timestamptz as starts_at,
    null::timestamptz as ends_at,
    observations.source_url,
    null::text as contact_url,
    false as is_sponsored,
    false as is_featured,
    observations.created_at,
    observations.updated_at,
    coalesce(retail_candidates.retailer_name, initcap(replace(observations.retailer_slug, '-', ' '))) as business_name,
    null::text as business_description,
    null::text as business_address,
    observations.store_city as business_commune,
    null::text as business_postal_code,
    null::numeric as business_latitude,
    null::numeric as business_longitude,
    null::text as business_phone,
    null::text as business_website_url,
    null::text as business_social_url,
    null::text as business_logo_url,
    false as business_is_verified,
    false as business_is_partner,
    null::text as deal_type,
    array['observed_price']::text[] as tags,
    false as is_free,
    concat_ws(
      ' - ',
      concat('Prix observe ', trim(to_char(observations.price, 'FM999999990D00')), ' EUR'),
      case
        when observations.unit_price is not null and nullif(observations.unit_price_unit, '') is not null
          then concat(trim(to_char(observations.unit_price, 'FM999999990D00')), ' EUR/', observations.unit_price_unit)
        else null
      end,
      case
        when observations.promotion_proven is true and observations.original_price is not null
          then concat('Au lieu de ', trim(to_char(observations.original_price, 'FM999999990D00')), ' EUR')
        else null
      end
    ) as price_note,
    'observed_price'::text as content_kind,
    observations.store_name as locality,
    null::text as territory_name,
    null::text as opening_hours_note,
    null::boolean as booking_required,
    null::integer as minimum_age,
    null::text as audience,
    'active'::text as availability_status,
    coalesce(observations.last_seen_at, observations.observed_at, observations.updated_at) as last_verified_at,
    null::timestamptz as verification_due_at,
    null::text as access_warning
  from public.retail_price_observations observations
  join public.retail_price_candidates retail_candidates
    on retail_candidates.published_price_observation_id = observations.id
   and retail_candidates.status = 'published'
   and retail_candidates.price_type = 'observed_price'
   and retail_candidates.matched_market_product_id is not null
   and retail_candidates.published_market_observation_id is not null
  left join public.market_products market_products
    on market_products.id = observations.market_product_id
  left join public.shopping_products shopping_products
    on shopping_products.id = observations.shopping_product_id
)
select * from base_good_deals
union all
select * from retail_promotions
union all
select * from retail_observed_prices;

comment on view public.published_good_deals is
  'Vue publique reunissant les bons plans publies ainsi que les promotions et prix observes retail publies via le flux admin.';

commit;
