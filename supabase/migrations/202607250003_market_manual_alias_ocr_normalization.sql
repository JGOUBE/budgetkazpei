-- OCR-aware normalization dedicated to learned manual aliases.
-- Keeps the generic market_normalize_text() behavior unchanged for other flows.

create or replace function public.market_normalize_manual_alias_text(value text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v_normalized text := public.market_normalize_text(value);
begin
  if v_normalized = '' then
    return '';
  end if;

  v_normalized := regexp_replace(
    v_normalized,
    '\m(?:[i1l][o0]{2}|100)(kg|gr|g|ml|cl|l)\M',
    '100\1',
    'g'
  );

  if v_normalized ~ '\m(tarama|cabillaud|oeuf|oeufs|nouille|nouilles|pate|pates|ravioli|quiche|cake|surimi|thon|mayonnaise|poisson)\M' then
    v_normalized := regexp_replace(
      v_normalized,
      '\m(?:deufs|ceufs|0eufs)\M',
      'oeufs',
      'g'
    );
  end if;

  return regexp_replace(trim(v_normalized), '\s+', ' ', 'g');
end;
$$;

comment on function public.market_normalize_manual_alias_text(text) is
  'Normalise les labels OCR des alias manuels avec des corrections contextuelles sures pour 100g et oeufs.';

update public.market_manual_product_aliases
set
  normalized_raw_label = public.market_normalize_manual_alias_text(raw_label),
  normalized_corrected_label = public.market_normalize_manual_alias_text(corrected_label),
  updated_at = now()
where
  normalized_raw_label is distinct from public.market_normalize_manual_alias_text(raw_label)
  or normalized_corrected_label is distinct from public.market_normalize_manual_alias_text(corrected_label);

create or replace function public.market_resolve_products_with_learned_aliases(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $resolver$
declare
  v_item jsonb;
  v_index integer;
  v_raw_name text;
  v_normalized_name text;
  v_barcode text;
  v_observed_price numeric;
  v_store_name text;
  v_store_city text;
  v_normalized_store_name text;
  v_normalized_store_city text;
  v_observed_date date;
  v_store_chain text;
  v_store_id uuid;
  v_exact_count integer;
  v_exact record;
  v_candidate record;
  v_result jsonb := '[]'::jsonb;
  v_fallback_items jsonb := '[]'::jsonb;
  v_fallback_item jsonb;
  v_fallback_result jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a jsonb array';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_index := case
      when coalesce(v_item->>'index', '') ~ '^\d+$'
        then (v_item->>'index')::integer
      else null
    end;
    v_raw_name := left(trim(coalesce(v_item->>'raw_name', '')), 180);
    v_normalized_name := public.market_normalize_manual_alias_text(v_raw_name);
    v_barcode := nullif(regexp_replace(coalesce(v_item->>'barcode', ''), '\D', '', 'g'), '');
    v_observed_price := case
      when coalesce(v_item->>'observed_price', '') ~ '^\d+(?:\.\d+)?$'
        then (v_item->>'observed_price')::numeric
      else null
    end;
    v_store_name := left(trim(coalesce(v_item->>'store_name', '')), 120);
    v_store_city := left(trim(coalesce(v_item->>'store_city', '')), 80);
    v_normalized_store_name := public.market_normalize_text(v_store_name);
    v_normalized_store_city := public.market_normalize_text(v_store_city);
    v_observed_date := case
      when coalesce(v_item->>'observed_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then (v_item->>'observed_date')::date
      else null
    end;
    v_store_chain := public.market_store_chain_key(v_store_name);
    v_store_id := null;

    if v_normalized_store_name <> '' then
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

    if v_index is null or (v_normalized_name = '' and v_barcode is null) then
      v_fallback_items := v_fallback_items || jsonb_build_array(v_item);
      continue;
    end if;

    select count(distinct aliases.product_id)
    into v_exact_count
    from public.market_manual_product_aliases aliases
    where aliases.status = 'active'
      and aliases.normalized_raw_label = v_normalized_name
      and (
        (aliases.scope = 'store' and v_store_id is not null and aliases.store_id = v_store_id)
        or (aliases.scope = 'chain' and v_store_chain <> '' and aliases.store_chain_key = v_store_chain)
        or aliases.scope = 'global'
      );

    if v_exact_count = 1 then
      select
        aliases.id,
        aliases.product_id,
        aliases.scope,
        aliases.confidence,
        aliases.validation_count,
        products.canonical_name,
        products.brand,
        products.category,
        products.subcategory,
        products.package_format
      into v_exact
      from public.market_manual_product_aliases aliases
      join public.market_products products
        on products.id = aliases.product_id
      where aliases.status = 'active'
        and aliases.normalized_raw_label = v_normalized_name
        and (
          (aliases.scope = 'store' and v_store_id is not null and aliases.store_id = v_store_id)
          or (aliases.scope = 'chain' and v_store_chain <> '' and aliases.store_chain_key = v_store_chain)
          or aliases.scope = 'global'
        )
      order by
        case aliases.scope
          when 'store' then 3
          when 'chain' then 2
          else 1
        end desc,
        aliases.validation_count desc,
        aliases.confidence desc,
        aliases.id
      limit 1;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'market_matched', true,
        'market_product_id', v_exact.product_id,
        'market_match_type', case v_exact.scope
          when 'store' then 'manual_alias_exact_store'
          when 'chain' then 'manual_alias_exact_chain'
          else 'manual_alias_exact_global'
        end,
        'market_match_confidence', greatest(0.92, least(0.999, v_exact.confidence)),
        'market_match_input_source', 'manual_alias',
        'market_canonical_name', v_exact.canonical_name,
        'market_brand', v_exact.brand,
        'market_category', v_exact.category,
        'market_subcategory', v_exact.subcategory,
        'market_package_format', v_exact.package_format
      ));
      continue;
    elsif v_exact_count > 1 then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'market_matched', false,
        'market_unmatched_reason', 'ambiguous_manual_alias'
      ));
      continue;
    end if;

    select *
    into v_candidate
    from (
      with eligible as (
        select
          aliases.id,
          aliases.product_id,
          aliases.scope,
          aliases.confidence,
          aliases.validation_count,
          aliases.observed_price,
          aliases.category,
          aliases.package_format,
          products.canonical_name,
          products.brand,
          products.category as product_category,
          products.subcategory,
          products.package_format as product_package_format,
          similarity(aliases.normalized_raw_label, v_normalized_name) as lexical_score,
          case
            when v_observed_price is not null
              and aliases.observed_price is not null
              and abs(aliases.observed_price - v_observed_price)
                <= greatest(0.20, least(2.00, aliases.observed_price * 0.12))
              then 1
            else 0
          end as price_score,
          case aliases.scope
            when 'store' then 3
            when 'chain' then 2
            else 1
          end as scope_rank
        from public.market_manual_product_aliases aliases
        join public.market_products products
          on products.id = aliases.product_id
        where aliases.status = 'active'
          and aliases.validation_count >= 1
          and aliases.confidence >= 0.70
          and similarity(aliases.normalized_raw_label, v_normalized_name) >= 0.72
          and (
            (aliases.scope = 'store' and v_store_id is not null and aliases.store_id = v_store_id)
            or (aliases.scope = 'chain' and v_store_chain <> '' and aliases.store_chain_key = v_store_chain)
            or aliases.scope = 'global'
          )
      ),
      ranked as (
        select
          eligible.*,
          (
            eligible.lexical_score * 0.70
            + eligible.confidence * 0.22
            + eligible.price_score * 0.08
            + case
              when eligible.scope_rank = 3 then 0.04
              when eligible.scope_rank = 2 then 0.02
              else 0
            end
          ) as total_score,
          row_number() over (
            order by
              (
                eligible.lexical_score * 0.70
                + eligible.confidence * 0.22
                + eligible.price_score * 0.08
                + case
                  when eligible.scope_rank = 3 then 0.04
                  when eligible.scope_rank = 2 then 0.02
                  else 0
                end
              ) desc,
              eligible.validation_count desc,
              eligible.id
          ) as rank_number,
          lead(
            (
              eligible.lexical_score * 0.70
              + eligible.confidence * 0.22
              + eligible.price_score * 0.08
              + case
                when eligible.scope_rank = 3 then 0.04
                when eligible.scope_rank = 2 then 0.02
                else 0
              end
            )
          ) over (
            order by
              (
                eligible.lexical_score * 0.70
                + eligible.confidence * 0.22
                + eligible.price_score * 0.08
                + case
                  when eligible.scope_rank = 3 then 0.04
                  when eligible.scope_rank = 2 then 0.02
                  else 0
                end
              ) desc,
              eligible.validation_count desc,
              eligible.id
          ) as second_score
        from eligible
      )
      select *
      from ranked
      where rank_number = 1
    ) scored;

    if found then
      if (
        v_candidate.total_score >= case
          when v_candidate.scope = 'store' then 0.96
          when v_candidate.scope = 'chain' then 0.97
          else 0.985
        end
        and v_candidate.lexical_score >= 0.88
        and v_candidate.confidence >= 0.84
        and (v_observed_price is null or v_candidate.price_score = 1)
        and v_candidate.validation_count >= case
          when v_candidate.scope = 'global' then 3
          else 2
        end
        and coalesce(v_candidate.total_score - v_candidate.second_score, v_candidate.total_score) >= 0.08
      ) then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'index', v_index,
          'market_matched', true,
          'market_product_id', v_candidate.product_id,
          'market_match_type', case v_candidate.scope
            when 'store' then 'manual_alias_fuzzy_store'
            when 'chain' then 'manual_alias_fuzzy_chain'
            else 'manual_alias_fuzzy_global'
          end,
          'market_match_confidence', least(0.995, greatest(0.01, v_candidate.total_score)),
          'market_match_input_source', 'manual_alias',
          'market_canonical_name', v_candidate.canonical_name,
          'market_brand', v_candidate.brand,
          'market_category', v_candidate.product_category,
          'market_subcategory', v_candidate.subcategory,
          'market_package_format', v_candidate.product_package_format
        ));
        continue;
      end if;

      if (
        v_candidate.total_score >= 0.80
        and v_candidate.lexical_score >= 0.78
        and v_candidate.confidence >= 0.74
      ) then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'index', v_index,
          'market_matched', false,
          'market_suggested', true,
          'market_suggestion_product_id', v_candidate.product_id,
          'market_suggestion_canonical_name', v_candidate.canonical_name,
          'market_suggestion_confidence', least(0.99, greatest(0.01, v_candidate.total_score)),
          'market_suggestion_scope', v_candidate.scope,
          'market_suggestion_reason', case
            when coalesce(v_candidate.total_score - v_candidate.second_score, v_candidate.total_score) < 0.08
              then 'manual_alias_candidate_ambiguous'
            else 'manual_alias_review_required'
          end
        ));
        continue;
      end if;
    end if;

    v_fallback_item := jsonb_build_object(
      'index', v_index,
      'raw_name', v_raw_name,
      'barcode', v_barcode,
      'observed_price', v_observed_price,
      'store_name', v_store_name,
      'store_city', v_store_city,
      'observed_date', v_observed_date,
      'brand', coalesce(v_item->>'brand', ''),
      'package_format', coalesce(v_item->>'package_format', ''),
      'alternate_names', case
        when jsonb_typeof(v_item->'alternate_names') = 'array' then v_item->'alternate_names'
        else '[]'::jsonb
      end
    );
    v_fallback_items := v_fallback_items || jsonb_build_array(v_fallback_item);
  end loop;

  if jsonb_array_length(v_fallback_items) > 0 then
    v_fallback_result := public.market_resolve_exact_products(v_fallback_items);
    v_result := v_result || coalesce(v_fallback_result, '[]'::jsonb);
  end if;

  return v_result;
end;
$resolver$;

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

  v_raw_label := left(trim(coalesce(v_item.ocr_name, '')), 180);
  v_corrected_label := left(trim(coalesce(v_item.corrected_name, v_item.name, '')), 180);
  v_normalized_raw_label := public.market_normalize_manual_alias_text(v_raw_label);
  v_normalized_corrected_label := public.market_normalize_manual_alias_text(v_corrected_label);
  v_price := case
    when v_item.total_price is not null and v_item.total_price > 0 then v_item.total_price
    when v_item.unit_price is not null and v_item.unit_price > 0 then v_item.unit_price
    else null
  end;

  if v_normalized_raw_label = '' or v_normalized_corrected_label = '' then
    return jsonb_build_object('ok', true, 'learned', false, 'reason', 'missing_label');
  end if;

  if v_normalized_raw_label = v_normalized_corrected_label then
    return jsonb_build_object('ok', true, 'learned', false, 'reason', 'no_manual_change');
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
    return jsonb_build_object('ok', true, 'learned', false, 'reason', 'global_disabled');
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
  end if;

  if v_product.id is null then
    return jsonb_build_object('ok', true, 'learned', false, 'reason', 'product_unresolved');
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
    'alias_id', v_alias_id,
    'product_id', v_product.id,
    'canonical_name', v_product.canonical_name,
    'scope', v_scope,
    'status', v_status,
    'validation_count', v_validation_count,
    'confidence', v_confidence
  );
end;
$learner$;
