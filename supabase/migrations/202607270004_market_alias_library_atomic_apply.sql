begin;

create or replace function public.market_apply_scoped_alias_library(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_zero_uuid constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a jsonb array';
  end if;

  create temp table pg_temp.market_apply_items (
    ordinal integer primary key,
    raw_item jsonb not null,
    recommended_action text not null,
    classification text not null,
    alias_payload jsonb null,
    product_payload jsonb null,
    raw_label text null,
    normalized_raw_label text null,
    scope text null,
    store_id uuid null,
    store_chain_key text null,
    status text null,
    source text null,
    confidence numeric null,
    evidence jsonb null,
    alias_product_id uuid null,
    product_key text null,
    canonical_name text null,
    normalized_name text null,
    brand text null,
    normalized_brand text null,
    category text null,
    subcategory text null,
    unit_type text null,
    package_size_value numeric null,
    package_size_unit text null,
    package_count integer null,
    package_format text null,
    barcode text null,
    duplicate_rank integer not null default 1,
    resolved_product_id uuid null,
    product_action text null,
    alias_action text null
  ) on commit drop;

  insert into pg_temp.market_apply_items (
    ordinal,
    raw_item,
    recommended_action,
    classification,
    alias_payload,
    product_payload,
    raw_label,
    normalized_raw_label,
    scope,
    store_id,
    store_chain_key,
    status,
    source,
    confidence,
    evidence,
    alias_product_id,
    product_key,
    canonical_name,
    normalized_name,
    brand,
    normalized_brand,
    category,
    subcategory,
    unit_type,
    package_size_value,
    package_size_unit,
    package_count,
    package_format,
    barcode
  )
  select
    entry.ordinality::integer,
    entry.item,
    trim(coalesce(entry.item->>'recommended_action', '')),
    trim(coalesce(entry.item->>'classification', '')),
    case
      when jsonb_typeof(entry.item->'proposed_alias') = 'object' then entry.item->'proposed_alias'
      else null
    end,
    case
      when jsonb_typeof(entry.item->'proposed_new_product') = 'object' then entry.item->'proposed_new_product'
      else null
    end,
    left(trim(coalesce(entry.item->'proposed_alias'->>'raw_label', '')), 180),
    left(trim(coalesce(entry.item->'proposed_alias'->>'normalized_raw_label', '')), 180),
    left(trim(coalesce(entry.item->'proposed_alias'->>'scope', '')), 20),
    case
      when coalesce(entry.item->'proposed_alias'->>'store_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (entry.item->'proposed_alias'->>'store_id')::uuid
      else null
    end,
    nullif(trim(coalesce(entry.item->'proposed_alias'->>'store_chain_key', '')), ''),
    left(trim(coalesce(entry.item->'proposed_alias'->>'status', '')), 32),
    left(trim(coalesce(entry.item->'proposed_alias'->>'source', '')), 80),
    case
      when coalesce(entry.item->'proposed_alias'->>'confidence', '') ~ '^-?\d+(?:\.\d+)?$'
        then (entry.item->'proposed_alias'->>'confidence')::numeric
      else null
    end,
    case
      when jsonb_typeof(entry.item->'proposed_alias'->'evidence') = 'object' then entry.item->'proposed_alias'->'evidence'
      else null
    end,
    case
      when coalesce(entry.item->'proposed_alias'->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (entry.item->'proposed_alias'->>'product_id')::uuid
      else null
    end,
    left(trim(coalesce(entry.item->'proposed_new_product'->>'product_key', '')), 220),
    left(trim(coalesce(entry.item->'proposed_new_product'->>'canonical_name', '')), 180),
    left(trim(coalesce(entry.item->'proposed_new_product'->>'normalized_name', '')), 180),
    nullif(left(trim(coalesce(entry.item->'proposed_new_product'->>'brand', '')), 80), ''),
    left(trim(coalesce(entry.item->'proposed_new_product'->>'normalized_brand', '')), 80),
    left(trim(coalesce(entry.item->'proposed_new_product'->>'category', '')), 120),
    nullif(left(trim(coalesce(entry.item->'proposed_new_product'->>'subcategory', '')), 120), ''),
    nullif(left(trim(coalesce(entry.item->'proposed_new_product'->>'unit_type', '')), 40), ''),
    case
      when coalesce(entry.item->'proposed_new_product'->>'package_size_value', '') ~ '^-?\d+(?:\.\d+)?$'
        then (entry.item->'proposed_new_product'->>'package_size_value')::numeric
      else null
    end,
    nullif(left(trim(coalesce(entry.item->'proposed_new_product'->>'package_size_unit', '')), 20), ''),
    case
      when coalesce(entry.item->'proposed_new_product'->>'package_count', '') ~ '^-?\d+$'
        then (entry.item->'proposed_new_product'->>'package_count')::integer
      else null
    end,
    nullif(left(trim(coalesce(entry.item->'proposed_new_product'->>'package_format', '')), 80), ''),
    nullif(regexp_replace(coalesce(entry.item->'proposed_new_product'->>'barcode', ''), '\D', '', 'g'), '')
  from jsonb_array_elements(p_items) with ordinality as entry(item, ordinality);

  if not exists (select 1 from pg_temp.market_apply_items) then
    return jsonb_build_object(
      'products_created', '[]'::jsonb,
      'products_reused', '[]'::jsonb,
      'aliases_created', '[]'::jsonb,
      'aliases_updated', '[]'::jsonb,
      'skipped', '[]'::jsonb,
      'errors', '[]'::jsonb
    );
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where jsonb_typeof(raw_item->'proposed_alias') is distinct from 'object'
  ) then
    raise exception 'each item must include proposed_alias as an object';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where raw_item ? 'proposed_new_product'
      and raw_item->'proposed_new_product' is not null
      and jsonb_typeof(raw_item->'proposed_new_product') <> 'object'
  ) then
    raise exception 'proposed_new_product must be an object when present';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where recommended_action <> 'library'
  ) then
    raise exception 'recommended_action must be library';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where classification not in ('exact_strong', 'strong_without_barcode', 'active_library_ready')
  ) then
    raise exception 'classification is not eligible for apply-library';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where coalesce(raw_label, '') = ''
      or coalesce(normalized_raw_label, '') = ''
      or coalesce(source, '') = ''
      or coalesce(status, '') = ''
      or evidence is null
      or confidence is null
  ) then
    raise exception 'proposed_alias payload is incomplete';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where normalized_raw_label <> public.market_normalize_text(raw_label)
  ) then
    raise exception 'normalized_raw_label must match market_normalize_text(raw_label)';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where status <> 'active'
  ) then
    raise exception 'status must be active for apply-library';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where scope not in ('global', 'chain', 'store')
  ) then
    raise exception 'scope must be global, chain, or store';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where confidence < 0
      or confidence > 1
  ) then
    raise exception 'confidence must stay between 0 and 1';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where (
      scope = 'store'
      and (store_id is null or store_chain_key is not null)
    ) or (
      scope = 'chain'
      and (store_id is not null or coalesce(store_chain_key, '') = '')
    ) or (
      scope = 'global'
      and (store_id is not null or store_chain_key is not null)
    )
  ) then
    raise exception 'scope payload is incoherent';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where scope = 'chain'
      and store_chain_key <> public.market_store_chain_key(store_chain_key)
  ) then
    raise exception 'store_chain_key must already be normalized';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where alias_product_id is null
      and product_payload is null
  ) then
    raise exception 'each alias must reference an existing product_id or a proposed_new_product';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where product_payload is not null
      and (
        coalesce(product_key, '') = ''
        or coalesce(canonical_name, '') = ''
        or coalesce(normalized_name, '') = ''
        or coalesce(category, '') = ''
      )
  ) then
    raise exception 'proposed_new_product payload is incomplete';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where product_payload is not null
      and normalized_name <> public.market_normalize_text(canonical_name)
  ) then
    raise exception 'normalized_name must match market_normalize_text(canonical_name)';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where product_payload is not null
      and normalized_brand <> public.market_normalize_text(coalesce(brand, ''))
  ) then
    raise exception 'normalized_brand must match market_normalize_text(brand)';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where barcode is not null
      and barcode !~ '^\d{8,14}$'
  ) then
    raise exception 'barcode must contain 8 to 14 digits when present';
  end if;

  with ranked as (
    select
      ordinal,
      row_number() over (
        partition by
          normalized_raw_label,
          scope,
          coalesce(store_id, v_zero_uuid),
          coalesce(store_chain_key, '')
        order by ordinal
      ) as duplicate_rank
    from pg_temp.market_apply_items
  )
  update pg_temp.market_apply_items as items
  set duplicate_rank = ranked.duplicate_rank
  from ranked
  where ranked.ordinal = items.ordinal;

  if exists (
    select 1
    from pg_temp.market_apply_items
    group by
      normalized_raw_label,
      scope,
      coalesce(store_id, v_zero_uuid),
      coalesce(store_chain_key, '')
    having count(distinct coalesce(alias_product_id::text, product_key, '')) > 1
  ) then
    raise exception 'conflicting duplicate scoped aliases detected in batch';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where duplicate_rank = 1
      and coalesce(product_key, '') <> ''
    group by product_key
    having
      count(distinct canonical_name) > 1
      or count(distinct coalesce(brand, '')) > 1
      or count(distinct coalesce(category, '')) > 1
      or count(distinct coalesce(package_format, '')) > 1
      or count(distinct coalesce(barcode, '')) > 1
  ) then
    raise exception 'conflicting product definitions detected in batch';
  end if;

  create temp table pg_temp.market_apply_products (
    product_key text primary key,
    canonical_name text not null,
    normalized_name text not null,
    brand text null,
    normalized_brand text not null,
    category text not null,
    subcategory text null,
    unit_type text null,
    package_size_value numeric null,
    package_size_unit text null,
    package_count integer null,
    package_format text null,
    barcode text null,
    resolved_product_id uuid null,
    product_action text null
  ) on commit drop;

  insert into pg_temp.market_apply_products (
    product_key,
    canonical_name,
    normalized_name,
    brand,
    normalized_brand,
    category,
    subcategory,
    unit_type,
    package_size_value,
    package_size_unit,
    package_count,
    package_format,
    barcode
  )
  select distinct on (product_key)
    product_key,
    canonical_name,
    normalized_name,
    brand,
    normalized_brand,
    category,
    subcategory,
    unit_type,
    package_size_value,
    package_size_unit,
    package_count,
    package_format,
    barcode
  from pg_temp.market_apply_items
  where duplicate_rank = 1
    and alias_product_id is null
    and coalesce(product_key, '') <> ''
  order by product_key, ordinal;

  update pg_temp.market_apply_products as payloads
  set
    resolved_product_id = products.id,
    product_action = 'reused'
  from public.market_products as products
  where products.product_key = payloads.product_key;

  create temp table pg_temp.market_apply_created_products
  on commit drop
  as
  with inserted as (
    insert into public.market_products (
      canonical_name,
      normalized_name,
      brand,
      normalized_brand,
      category,
      subcategory,
      unit_type,
      package_size_value,
      package_size_unit,
      package_count,
      package_format,
      barcode,
      product_key
    )
    select
      canonical_name,
      normalized_name,
      brand,
      normalized_brand,
      category,
      subcategory,
      unit_type,
      package_size_value,
      package_size_unit,
      package_count,
      package_format,
      barcode,
      product_key
    from pg_temp.market_apply_products
    where resolved_product_id is null
    on conflict (product_key) do nothing
    returning product_key, id
  )
  select product_key, id
  from inserted;

  update pg_temp.market_apply_products as payloads
  set
    resolved_product_id = created.id,
    product_action = 'created'
  from pg_temp.market_apply_created_products as created
  where created.product_key = payloads.product_key;

  update pg_temp.market_apply_products as payloads
  set
    resolved_product_id = products.id,
    product_action = coalesce(payloads.product_action, 'reused')
  from public.market_products as products
  where payloads.resolved_product_id is null
    and products.product_key = payloads.product_key;

  update pg_temp.market_apply_items as items
  set
    resolved_product_id = items.alias_product_id,
    product_action = 'reused'
  where items.duplicate_rank = 1
    and items.alias_product_id is not null;

  if exists (
    select 1
    from pg_temp.market_apply_items as items
    left join public.market_products as products
      on products.id = items.alias_product_id
    where items.duplicate_rank = 1
      and items.alias_product_id is not null
      and products.id is null
  ) then
    raise exception 'proposed_alias.product_id does not exist';
  end if;

  if exists (
    select 1
    from pg_temp.market_apply_items as items
    join public.market_products as products
      on products.id = items.alias_product_id
    where items.duplicate_rank = 1
      and items.alias_product_id is not null
      and items.product_payload is not null
      and products.product_key <> items.product_key
  ) then
    raise exception 'proposed_alias.product_id and proposed_new_product.product_key disagree';
  end if;

  update pg_temp.market_apply_items as items
  set
    resolved_product_id = payloads.resolved_product_id,
    product_action = payloads.product_action
  from pg_temp.market_apply_products as payloads
  where items.duplicate_rank = 1
    and items.alias_product_id is null
    and items.product_key = payloads.product_key;

  if exists (
    select 1
    from pg_temp.market_apply_items
    where duplicate_rank = 1
      and resolved_product_id is null
  ) then
    raise exception 'unable to resolve a product for every alias';
  end if;

  create temp table pg_temp.market_apply_existing_aliases
  on commit drop
  as
  select
    items.ordinal,
    aliases.id as alias_id,
    aliases.product_id as existing_product_id,
    case
      when aliases.id is null then 'created'
      else 'updated'
    end as alias_action
  from pg_temp.market_apply_items as items
  left join public.market_product_aliases as aliases
    on aliases.normalized_raw_label = items.normalized_raw_label
   and aliases.scope = items.scope
   and coalesce(aliases.store_id, v_zero_uuid) = coalesce(items.store_id, v_zero_uuid)
   and coalesce(aliases.store_chain_key, '') = coalesce(items.store_chain_key, '')
   and aliases.status = 'active'
  where items.duplicate_rank = 1;

  if exists (
    select 1
    from pg_temp.market_apply_existing_aliases as existing_aliases
    join pg_temp.market_apply_items as items
      on items.ordinal = existing_aliases.ordinal
    where existing_aliases.alias_id is not null
      and existing_aliases.existing_product_id <> items.resolved_product_id
  ) then
    raise exception 'active scoped alias already points to another product';
  end if;

  update pg_temp.market_apply_items as items
  set alias_action = existing_aliases.alias_action
  from pg_temp.market_apply_existing_aliases as existing_aliases
  where existing_aliases.ordinal = items.ordinal;

  insert into public.market_product_aliases (
    product_id,
    raw_label,
    normalized_raw_label,
    source,
    confidence,
    created_at,
    scope,
    store_id,
    store_chain_key,
    status,
    evidence,
    updated_at,
    verified_at
  )
  select
    resolved_product_id,
    raw_label,
    normalized_raw_label,
    source,
    confidence,
    now(),
    scope,
    store_id,
    store_chain_key,
    'active',
    evidence,
    now(),
    now()
  from pg_temp.market_apply_items
  where duplicate_rank = 1
  on conflict (
    normalized_raw_label,
    scope,
    (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(store_chain_key, ''))
  )
  where status = 'active'
  do update
  set
    product_id = excluded.product_id,
    raw_label = excluded.raw_label,
    source = excluded.source,
    confidence = greatest(public.market_product_aliases.confidence, excluded.confidence),
    evidence = coalesce(public.market_product_aliases.evidence, '{}'::jsonb) || coalesce(excluded.evidence, '{}'::jsonb),
    updated_at = now(),
    verified_at = now();

  return jsonb_build_object(
    'products_created',
    coalesce((
      select jsonb_agg(product_row.payload order by product_row.canonical_name)
      from (
        select distinct
          products.canonical_name,
          jsonb_build_object(
            'id', products.id,
            'product_key', products.product_key,
            'canonical_name', products.canonical_name
          ) as payload
        from pg_temp.market_apply_items as items
        join public.market_products as products
          on products.id = items.resolved_product_id
        where items.duplicate_rank = 1
          and items.product_action = 'created'
      ) as product_row
    ), '[]'::jsonb),
    'products_reused',
    coalesce((
      select jsonb_agg(product_row.payload order by product_row.canonical_name)
      from (
        select distinct
          products.canonical_name,
          jsonb_build_object(
            'id', products.id,
            'product_key', products.product_key,
            'canonical_name', products.canonical_name
          ) as payload
        from pg_temp.market_apply_items as items
        join public.market_products as products
          on products.id = items.resolved_product_id
        where items.duplicate_rank = 1
          and items.product_action = 'reused'
      ) as product_row
    ), '[]'::jsonb),
    'aliases_created',
    coalesce((
      select jsonb_agg(alias_row.payload order by alias_row.ordinal)
      from (
        select
          items.ordinal,
          jsonb_build_object(
            'product_id', items.resolved_product_id,
            'raw_label', items.raw_label,
            'normalized_raw_label', items.normalized_raw_label,
            'scope', items.scope,
            'store_id', items.store_id,
            'store_chain_key', items.store_chain_key,
            'status', 'active'
          ) as payload
        from pg_temp.market_apply_items as items
        where items.duplicate_rank = 1
          and items.alias_action = 'created'
      ) as alias_row
    ), '[]'::jsonb),
    'aliases_updated',
    coalesce((
      select jsonb_agg(alias_row.payload order by alias_row.ordinal)
      from (
        select
          items.ordinal,
          jsonb_build_object(
            'product_id', items.resolved_product_id,
            'raw_label', items.raw_label,
            'normalized_raw_label', items.normalized_raw_label,
            'scope', items.scope,
            'store_id', items.store_id,
            'store_chain_key', items.store_chain_key,
            'status', 'active'
          ) as payload
        from pg_temp.market_apply_items as items
        where items.duplicate_rank = 1
          and items.alias_action = 'updated'
      ) as alias_row
    ), '[]'::jsonb),
    'skipped',
    coalesce((
      select jsonb_agg(alias_row.payload order by alias_row.ordinal)
      from (
        select
          items.ordinal,
          jsonb_build_object(
            'raw_label', items.raw_label,
            'normalized_raw_label', items.normalized_raw_label,
            'scope', items.scope,
            'store_id', items.store_id,
            'store_chain_key', items.store_chain_key,
            'reason', 'duplicate_scoped_alias_in_batch'
          ) as payload
        from pg_temp.market_apply_items as items
        where items.duplicate_rank > 1
      ) as alias_row
    ), '[]'::jsonb),
    'errors',
    '[]'::jsonb
  );
end;
$function$;

alter function public.market_apply_scoped_alias_library(jsonb) owner to postgres;

revoke all on function public.market_apply_scoped_alias_library(jsonb) from public;
revoke execute on function public.market_apply_scoped_alias_library(jsonb) from anon;
revoke execute on function public.market_apply_scoped_alias_library(jsonb) from authenticated;
grant execute on function public.market_apply_scoped_alias_library(jsonb) to service_role;

comment on function public.market_apply_scoped_alias_library(jsonb) is
  'Atomically applies a validated batch of scoped alias library items, reusing products by product_key and rolling back the whole batch if any alias fails.';

commit;
