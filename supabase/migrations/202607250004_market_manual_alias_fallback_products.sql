create or replace function public.market_learn_alias_from_receipt_item(
  p_receipt_item_id uuid,
  p_source text default 'user_manual_correction',
  p_allow_global boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $learner$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_store_id uuid;
  v_store_chain_key text;
  v_raw_label text;
  v_corrected_label text;
  v_normalized_raw_label text;
  v_normalized_corrected_label text;
  v_price numeric;
  v_scope text;
  v_product record;
  v_resolution_item jsonb;
  v_existing record;
  v_alias_id uuid;
  v_confidence numeric;
  v_validation_count integer;
  v_status text;
  v_source text := left(trim(coalesce(p_source, 'user_manual_correction')), 80);
  v_alias_result text := 'created';
  v_product_strategy text := 'existing_product';
  v_fallback_brand text;
  v_fallback_normalized_brand text;
  v_fallback_category text;
  v_fallback_package_format text;
  v_fallback_normalized_package_format text;
  v_fallback_product_key text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_receipt_item_id is null then
    raise exception 'receipt item required';
  end if;

  select
    receipt_items.id,
    receipt_items.user_id,
    receipt_items.ocr_name,
    receipt_items.corrected_name,
    receipt_items.name,
    receipt_items.market_product_id,
    receipt_items.market_package_format,
    receipt_items.brand,
    receipt_items.category,
    receipt_items.total_price,
    receipt_items.unit_price,
    receipts.store_name,
    receipts.store_location,
    receipts.purchase_date
  into v_item
  from public.receipt_items
  join public.receipts
    on receipts.id = receipt_items.receipt_id
  where receipt_items.id = p_receipt_item_id
    and receipt_items.user_id = v_user_id
    and receipts.user_id = v_user_id;

  if not found then
    raise exception 'receipt item not found or forbidden' using errcode = '42501';
  end if;

  v_raw_label := left(trim(coalesce(v_item.ocr_name, v_item.name, '')), 180);
  v_corrected_label := left(trim(coalesce(v_item.corrected_name, v_item.name, '')), 180);
  v_normalized_raw_label := public.market_normalize_manual_alias_text(v_raw_label);
  v_normalized_corrected_label := public.market_normalize_manual_alias_text(v_corrected_label);
  v_price := case
    when v_item.total_price is not null and v_item.total_price > 0 then v_item.total_price
    when v_item.unit_price is not null and v_item.unit_price > 0 then v_item.unit_price
    else null
  end;

  if v_normalized_raw_label = '' or v_normalized_corrected_label = '' then
    return jsonb_build_object(
      'ok', true,
      'learned', false,
      'result', 'skipped',
      'reason', 'missing_label'
    );
  end if;

  if v_normalized_raw_label = v_normalized_corrected_label then
    return jsonb_build_object(
      'ok', true,
      'learned', false,
      'result', 'skipped',
      'reason', 'no_manual_change'
    );
  end if;

  v_store_chain_key := public.market_store_chain_key(v_item.store_name);
  v_store_id := null;

  if public.market_normalize_text(v_item.store_name) <> '' then
    select case
      when count(*) = 1 then (array_agg(id order by id))[1]
      else null
    end
    into v_store_id
    from public.market_stores
    where normalized_store_name = public.market_normalize_text(v_item.store_name)
      and (
        public.market_normalize_text(coalesce(v_item.store_location, '')) = ''
        or normalized_city = public.market_normalize_text(v_item.store_location)
      );
  end if;

  if v_store_chain_key <> '' then
    v_scope := 'chain';
  elsif v_store_id is not null then
    v_scope := 'store';
  elsif p_allow_global then
    v_scope := 'global';
  else
    return jsonb_build_object(
      'ok', true,
      'learned', false,
      'result', 'skipped',
      'reason', 'global_disabled'
    );
  end if;

  select
    products.id,
    products.canonical_name,
    products.brand,
    products.category,
    products.subcategory,
    products.package_format
  into v_product
  from public.market_products products
  where products.id = v_item.market_product_id;

  if v_product.id is not null then
    v_product_strategy := 'receipt_item_market_product';
  end if;

  select value
  into v_resolution_item
  from jsonb_array_elements(
    public.market_resolve_exact_products(
      jsonb_build_array(
        jsonb_build_object(
          'index', 0,
          'raw_name', v_corrected_label,
          'barcode', null,
          'observed_price', v_price,
          'store_name', left(trim(coalesce(v_item.store_name, '')), 120),
          'store_city', left(trim(coalesce(v_item.store_location, '')), 80),
          'observed_date', case
            when v_item.purchase_date is not null then to_char(v_item.purchase_date, 'YYYY-MM-DD')
            else null
          end,
          'alternate_names', jsonb_build_array()
        )
      )
    )
  ) value
  limit 1;

  if coalesce((v_resolution_item->>'market_matched')::boolean, false) then
    select
      products.id,
      products.canonical_name,
      products.brand,
      products.category,
      products.subcategory,
      products.package_format
    into v_product
    from public.market_products products
    where products.id = (v_resolution_item->>'market_product_id')::uuid;

    if v_product.id is not null then
      v_product_strategy := 'exact_resolution';
    end if;
  end if;

  if v_product.id is null then
    v_fallback_brand := nullif(left(trim(coalesce(v_item.brand, '')), 160), '');
    v_fallback_normalized_brand := public.market_normalize_text(v_fallback_brand);
    v_fallback_category := case
      when left(trim(coalesce(v_item.category, '')), 120) <> '' then left(trim(v_item.category), 120)
      else 'alimentaire'
    end;
    v_fallback_package_format := nullif(left(trim(coalesce(v_item.market_package_format, '')), 120), '');
    v_fallback_normalized_package_format := public.market_normalize_text(v_fallback_package_format);
    v_fallback_product_key := left(
      concat_ws(
        '|',
        v_normalized_corrected_label,
        coalesce(v_fallback_normalized_brand, ''),
        public.market_normalize_text(v_fallback_category),
        coalesce(v_fallback_normalized_package_format, '')
      ),
      240
    );

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
    values (
      v_corrected_label,
      v_normalized_corrected_label,
      v_fallback_brand,
      coalesce(v_fallback_normalized_brand, ''),
      v_fallback_category,
      null,
      null,
      null,
      null,
      null,
      v_fallback_package_format,
      null,
      v_fallback_product_key
    )
    on conflict (product_key) do update
    set
      canonical_name = excluded.canonical_name,
      normalized_name = excluded.normalized_name,
      brand = coalesce(excluded.brand, public.market_products.brand),
      normalized_brand = excluded.normalized_brand,
      category = coalesce(nullif(excluded.category, ''), public.market_products.category),
      package_format = coalesce(excluded.package_format, public.market_products.package_format)
    returning
      market_products.id,
      market_products.canonical_name,
      market_products.brand,
      market_products.category,
      market_products.subcategory,
      market_products.package_format
    into v_product;

    v_product_strategy := 'fallback_product_upsert';
  end if;

  if v_product.id is null then
    return jsonb_build_object(
      'ok', false,
      'learned', false,
      'result', 'failed',
      'reason', 'product_unresolved'
    );
  end if;

  v_confidence := case v_scope
    when 'store' then 0.86
    when 'chain' then 0.82
    else 0.60
  end;

  if v_price is not null then
    v_confidence := least(0.95, v_confidence + 0.03);
  end if;

  if v_item.market_product_id is not null and v_item.market_product_id = v_product.id then
    v_confidence := least(0.97, v_confidence + 0.04);
  end if;

  select *
  into v_existing
  from public.market_manual_product_aliases aliases
  where aliases.product_id = v_product.id
    and aliases.normalized_raw_label = v_normalized_raw_label
    and aliases.scope = v_scope
    and coalesce(aliases.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(case when v_scope = 'store' then v_store_id else null end, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(aliases.store_chain_key, '')
      = coalesce(case when v_scope = 'chain' then v_store_chain_key else null end, '');

  if found then
    v_alias_result := 'strengthened';
    v_validation_count := greatest(coalesce(v_existing.validation_count, 1), 1) + 1;
    v_status := case
      when coalesce(v_existing.status, 'active') = 'rejected' then 'needs_review'
      else 'active'
    end;

    update public.market_manual_product_aliases
    set
      raw_label = v_raw_label,
      normalized_raw_label = v_normalized_raw_label,
      corrected_label = v_corrected_label,
      normalized_corrected_label = v_normalized_corrected_label,
      scope = v_scope,
      store_id = case when v_scope = 'store' then v_store_id else null end,
      store_chain_key = case when v_scope = 'chain' then v_store_chain_key else null end,
      source = v_source,
      status = v_status,
      confidence = case
        when v_status = 'needs_review'
          then least(0.79, greatest(coalesce(v_existing.confidence, 0), v_confidence))
        else least(
          0.995,
          greatest(coalesce(v_existing.confidence, 0), v_confidence)
          + case
            when v_validation_count >= 3 then 0.08
            when v_validation_count = 2 then 0.05
            else 0.03
          end
        )
      end,
      validation_count = v_validation_count,
      first_observed_at = coalesce(v_existing.first_observed_at, now()),
      last_observed_at = now(),
      observed_price = coalesce(v_price, observed_price),
      brand = coalesce(nullif(v_item.brand, ''), v_product.brand, brand),
      category = coalesce(nullif(v_item.category, ''), v_product.category, category),
      package_format = coalesce(nullif(v_item.market_package_format, ''), v_product.package_format, package_format),
      rejection_reason = null,
      updated_at = now()
    where id = v_existing.id
    returning id, confidence, validation_count, status
    into v_alias_id, v_confidence, v_validation_count, v_status;
  else
    insert into public.market_manual_product_aliases (
      product_id,
      raw_label,
      normalized_raw_label,
      corrected_label,
      normalized_corrected_label,
      scope,
      store_id,
      store_chain_key,
      source,
      status,
      confidence,
      validation_count,
      first_observed_at,
      last_observed_at,
      observed_price,
      brand,
      category,
      package_format
    )
    values (
      v_product.id,
      v_raw_label,
      v_normalized_raw_label,
      v_corrected_label,
      v_normalized_corrected_label,
      v_scope,
      case when v_scope = 'store' then v_store_id else null end,
      case when v_scope = 'chain' then v_store_chain_key else null end,
      v_source,
      'active',
      v_confidence,
      1,
      now(),
      now(),
      v_price,
      coalesce(nullif(v_item.brand, ''), v_product.brand),
      coalesce(nullif(v_item.category, ''), v_product.category),
      coalesce(nullif(v_item.market_package_format, ''), v_product.package_format)
    )
    returning id, confidence, validation_count, status
    into v_alias_id, v_confidence, v_validation_count, v_status;
  end if;

  update public.receipt_items
  set
    market_product_id = v_product.id,
    market_matched = (v_status = 'active'),
    market_match_type = case
      when v_validation_count > 1 then 'manual_user_correction_reinforced'
      else 'manual_user_correction'
    end,
    market_match_confidence = v_confidence,
    market_canonical_name = v_product.canonical_name,
    market_brand = v_product.brand,
    market_category = v_product.category,
    market_subcategory = v_product.subcategory,
    market_package_format = v_product.package_format
  where id = p_receipt_item_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'learned', true,
    'result', v_alias_result,
    'alias_id', v_alias_id,
    'product_id', v_product.id,
    'canonical_name', v_product.canonical_name,
    'scope', v_scope,
    'status', v_status,
    'validation_count', v_validation_count,
    'confidence', v_confidence,
    'product_strategy', v_product_strategy
  );
end;
$learner$;
