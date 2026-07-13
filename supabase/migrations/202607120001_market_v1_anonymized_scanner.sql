alter table public.market_price_observations
  add column if not exists batch_item_key text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_price_observations_batch_item_key_not_blank'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_batch_item_key_not_blank
      check (
        batch_item_key is null
        or length(trim(batch_item_key)) > 0
      );
  end if;
end $$;

drop index if exists public.market_price_observations_batch_dedupe_uk;

create unique index if not exists market_price_observations_batch_item_key_uk
  on public.market_price_observations (batch_id, batch_item_key)
  where batch_id is not null
    and batch_item_key is not null;

create unique index if not exists market_price_observations_batch_dedupe_legacy_uk
  on public.market_price_observations (
    batch_id,
    store_id,
    product_id,
    observed_date,
    price,
    quantity,
    coalesce(unit_price, -1),
    coalesce(unit_type, '')
  )
  where batch_id is not null
    and batch_item_key is null;

create or replace function public.market_resolve_exact_products(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_index integer;
  v_raw_name text;
  v_normalized_name text;
  v_barcode text;
  v_match_type text;
  v_product_ids uuid[];
  v_product record;
  v_unmatched_reason text;
  v_result jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a jsonb array';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_index := case
      when coalesce(v_item->>'index', '') ~ '^\d+$' then (v_item->>'index')::integer
      else null
    end;
    v_raw_name := left(trim(coalesce(v_item->>'raw_name', '')), 180);
    v_normalized_name := public.market_normalize_text(v_raw_name);
    v_barcode := nullif(regexp_replace(coalesce(v_item->>'barcode', ''), '\D', '', 'g'), '');
    v_match_type := null;
    v_product_ids := array[]::uuid[];
    v_unmatched_reason := 'not_found';

    if v_index is null then
      continue;
    end if;

    if v_barcode is not null then
      select coalesce(array_agg(distinct id), array[]::uuid[])
      into v_product_ids
      from public.market_products
      where barcode = v_barcode;

      if cardinality(v_product_ids) = 1 then
        v_match_type := 'barcode_exact';
      elsif cardinality(v_product_ids) > 1 then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'index', v_index,
          'market_matched', false,
          'market_unmatched_reason', 'ambiguous_barcode'
        ));
        continue;
      end if;
    end if;

    if v_match_type is null and v_normalized_name <> '' then
      select coalesce(array_agg(distinct product_id), array[]::uuid[])
      into v_product_ids
      from public.market_product_aliases
      where normalized_raw_label = v_normalized_name;

      if cardinality(v_product_ids) = 1 then
        v_match_type := 'alias_exact';
      elsif cardinality(v_product_ids) > 1 then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'index', v_index,
          'market_matched', false,
          'market_unmatched_reason', 'ambiguous_alias'
        ));
        continue;
      end if;
    end if;

    if v_match_type is null and v_normalized_name <> '' then
      select coalesce(array_agg(distinct id), array[]::uuid[])
      into v_product_ids
      from public.market_products
      where normalized_name = v_normalized_name;

      if cardinality(v_product_ids) = 1 then
        v_match_type := 'normalized_name_exact';
      elsif cardinality(v_product_ids) > 1 then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'index', v_index,
          'market_matched', false,
          'market_unmatched_reason', 'ambiguous_normalized_name'
        ));
        continue;
      end if;
    end if;

    if v_match_type is null then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'market_matched', false,
        'market_unmatched_reason', v_unmatched_reason
      ));
      continue;
    end if;

    select
      id,
      canonical_name,
      brand,
      category,
      subcategory,
      package_format
    into v_product
    from public.market_products
    where id = v_product_ids[1];

    if v_product.id is null then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'market_matched', false
      ));
      continue;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'market_matched', true,
      'market_product_id', v_product.id,
      'market_match_type', v_match_type,
      'market_match_confidence', 1,
      'market_canonical_name', v_product.canonical_name,
      'market_brand', v_product.brand,
      'market_category', v_product.category,
      'market_subcategory', v_product.subcategory,
      'market_package_format', v_product.package_format
    ));
  end loop;

  return v_result;
end;
$$;

create or replace function public.market_sync_anonymized_batch(
  p_batch_key text,
  p_store_id uuid,
  p_observed_date date,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_deleted integer := 0;
  v_created integer := 0;
  v_alias_created integer := 0;
  v_skipped integer := 0;
  v_item jsonb;
  v_batch_item_key text;
  v_product_id uuid;
  v_observed_name text;
  v_normalized_name text;
  v_price numeric;
  v_quantity numeric;
  v_unit_price numeric;
  v_unit_type text;
  v_allow_alias boolean;
  v_product_exists boolean;
  v_alias_exists boolean;
  v_alias_product_ids uuid[];
begin
  if p_batch_key is null or p_batch_key not like 'receipt_scan_anonymized:%' or length(trim(p_batch_key)) <= length('receipt_scan_anonymized:') then
    raise exception 'invalid anonymized batch key';
  end if;

  if p_store_id is null then
    raise exception 'store is required';
  end if;

  if p_observed_date is null then
    raise exception 'observed date is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a jsonb array';
  end if;

  if exists (
    select 1
    from (
      select trim(value->>'batch_item_key') as batch_item_key
      from jsonb_array_elements(p_items)
    ) payload
    where batch_item_key is not null
      and batch_item_key <> ''
    group by batch_item_key
    having count(*) > 1
  ) then
    raise exception 'duplicate batch item key';
  end if;

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
    p_batch_key,
    'receipt_scan_anonymized',
    p_store_id,
    p_observed_date,
    null,
    null,
    null,
    null
  )
  on conflict (batch_key) do update
    set source = 'receipt_scan_anonymized',
        store_id = excluded.store_id,
        observed_date = excluded.observed_date,
        notes = null,
        receipt_total_before_discount = null,
        receipt_unallocated_discount = null,
        receipt_total_paid = null
  returning id into v_batch_id;

  delete from public.market_price_observations
  where batch_id = v_batch_id;
  get diagnostics v_deleted = row_count;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_batch_item_key := trim(coalesce(v_item->>'batch_item_key', ''));
    v_product_id := case
      when coalesce(v_item->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (v_item->>'product_id')::uuid
      else null
    end;
    v_observed_name := left(trim(coalesce(v_item->>'observed_name', '')), 180);
    v_normalized_name := public.market_normalize_text(v_observed_name);
    v_price := nullif(v_item->>'price', '')::numeric;
    v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 1);
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric;
    v_unit_type := nullif(trim(coalesce(v_item->>'unit_type', '')), '');
    v_allow_alias := coalesce(nullif(v_item->>'allow_alias', '')::boolean, false);

    if v_batch_item_key = ''
      or v_product_id is null
      or v_observed_name = ''
      or v_price is null
      or v_price <= 0
      or v_quantity <= 0
    then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select exists (
      select 1 from public.market_products where id = v_product_id
    ) into v_product_exists;

    if not v_product_exists then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_unit_price is null or v_unit_type is null then
      v_unit_price := null;
      v_unit_type := null;
    end if;

    select coalesce(array_agg(distinct product_id), array[]::uuid[])
    into v_alias_product_ids
    from public.market_product_aliases
    where normalized_raw_label = v_normalized_name;

    v_alias_exists := v_product_id = any(v_alias_product_ids);

    if v_allow_alias
      and not v_alias_exists
      and v_normalized_name <> ''
      and cardinality(v_alias_product_ids) = 0
    then
      insert into public.market_product_aliases (
        product_id,
        raw_label,
        normalized_raw_label,
        source,
        confidence
      )
      values (
        v_product_id,
        v_observed_name,
        v_normalized_name,
        'receipt_scan_anonymized',
        1
      );
      v_alias_created := v_alias_created + 1;
    end if;

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
      p_store_id,
      v_product_id,
      p_observed_date,
      v_price,
      v_quantity,
      v_unit_price,
      v_unit_type,
      false,
      null,
      1,
      'receipt_scan_anonymized',
      v_batch_id,
      v_batch_item_key,
      null,
      null
    );

    v_created := v_created + 1;
  end loop;

  if v_created = 0 then
    delete from public.market_seed_batches
    where id = v_batch_id;
  end if;

  return jsonb_build_object(
    'batch_deleted', v_created = 0,
    'observations_deleted', v_deleted,
    'observations_created', v_created,
    'aliases_created', v_alias_created,
    'items_skipped', v_skipped
  );
end;
$$;

create or replace function public.market_delete_anonymized_batch(p_batch_key text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_deleted integer := 0;
begin
  if p_batch_key is null or p_batch_key not like 'receipt_scan_anonymized:%' or length(trim(p_batch_key)) <= length('receipt_scan_anonymized:') then
    raise exception 'invalid anonymized batch key';
  end if;

  select id into v_batch_id
  from public.market_seed_batches
  where batch_key = p_batch_key;

  if v_batch_id is null then
    return jsonb_build_object(
      'batch_deleted', false,
      'observations_deleted', 0
    );
  end if;

  delete from public.market_price_observations
  where batch_id = v_batch_id;
  get diagnostics v_deleted = row_count;

  delete from public.market_seed_batches
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_deleted', true,
    'observations_deleted', v_deleted
  );
end;
$$;

revoke execute on function public.market_resolve_exact_products(jsonb) from public;
revoke execute on function public.market_resolve_exact_products(jsonb) from anon;
revoke execute on function public.market_resolve_exact_products(jsonb) from authenticated;
grant execute on function public.market_resolve_exact_products(jsonb) to service_role;

revoke execute on function public.market_sync_anonymized_batch(text, uuid, date, jsonb) from public;
revoke execute on function public.market_sync_anonymized_batch(text, uuid, date, jsonb) from anon;
revoke execute on function public.market_sync_anonymized_batch(text, uuid, date, jsonb) from authenticated;
grant execute on function public.market_sync_anonymized_batch(text, uuid, date, jsonb) to service_role;

revoke execute on function public.market_delete_anonymized_batch(text) from public;
revoke execute on function public.market_delete_anonymized_batch(text) from anon;
revoke execute on function public.market_delete_anonymized_batch(text) from authenticated;
grant execute on function public.market_delete_anonymized_batch(text) to service_role;
