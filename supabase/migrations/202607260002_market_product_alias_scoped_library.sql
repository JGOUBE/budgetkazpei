begin;

alter table public.market_product_aliases
  add column if not exists scope text not null default 'global',
  add column if not exists store_id uuid null references public.market_stores(id) on delete set null,
  add column if not exists store_chain_key text null,
  add column if not exists status text not null default 'active',
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists verified_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_product_aliases_scope_valid'
      and conrelid = 'public.market_product_aliases'::regclass
  ) then
    alter table public.market_product_aliases
      add constraint market_product_aliases_scope_valid
      check (scope in ('store', 'chain', 'global'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_product_aliases_status_valid'
      and conrelid = 'public.market_product_aliases'::regclass
  ) then
    alter table public.market_product_aliases
      add constraint market_product_aliases_status_valid
      check (status in ('active', 'rejected', 'needs_review'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_product_aliases_scope_coherent'
      and conrelid = 'public.market_product_aliases'::regclass
  ) then
    alter table public.market_product_aliases
      add constraint market_product_aliases_scope_coherent
      check (
        (scope = 'store' and store_id is not null and coalesce(length(trim(store_chain_key)), 0) = 0)
        or (scope = 'chain' and store_id is null and coalesce(length(trim(store_chain_key)), 0) > 0)
        or (scope = 'global' and store_id is null and coalesce(length(trim(store_chain_key)), 0) = 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_product_aliases_evidence_object'
      and conrelid = 'public.market_product_aliases'::regclass
  ) then
    alter table public.market_product_aliases
      add constraint market_product_aliases_evidence_object
      check (jsonb_typeof(evidence) = 'object');
  end if;
end $$;

update public.market_product_aliases
set
  scope = coalesce(nullif(scope, ''), 'global'),
  status = coalesce(nullif(status, ''), 'active'),
  updated_at = coalesce(updated_at, created_at, now()),
  verified_at = coalesce(verified_at, created_at)
where
  scope is distinct from coalesce(nullif(scope, ''), 'global')
  or status is distinct from coalesce(nullif(status, ''), 'active')
  or updated_at is null
  or verified_at is null;

create unique index if not exists market_product_aliases_active_scope_uk
  on public.market_product_aliases (
    normalized_raw_label,
    scope,
    coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(store_chain_key, '')
  )
  where status = 'active';

create index if not exists market_product_aliases_scope_lookup_idx
  on public.market_product_aliases (
    normalized_raw_label,
    status,
    scope,
    store_chain_key,
    store_id,
    confidence desc
  );

create or replace function public.market_resolve_exact_products(p_items jsonb)
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
  v_store_chain text;
  v_store_id uuid;
  v_match_type text;
  v_match_confidence numeric;
  v_match_input_source text;
  v_product_ids uuid[];
  v_selected_product_id uuid;
  v_product record;
  v_candidate record;
  v_margin numeric;
  v_required_margin numeric;
  v_result jsonb := '[]'::jsonb;
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
    v_normalized_name := public.market_normalize_text(v_raw_name);
    v_barcode := nullif(
      regexp_replace(coalesce(v_item->>'barcode', ''), '\D', '', 'g'),
      ''
    );
    v_observed_price := case
      when coalesce(v_item->>'observed_price', '') ~ '^\d+(?:\.\d+)?$'
        then (v_item->>'observed_price')::numeric
      else null
    end;
    v_store_name := left(trim(coalesce(v_item->>'store_name', '')), 120);
    v_store_city := left(trim(coalesce(v_item->>'store_city', '')), 80);
    v_normalized_store_name := public.market_normalize_text(v_store_name);
    v_normalized_store_city := public.market_normalize_text(v_store_city);
    v_store_chain := public.market_store_chain_key(v_store_name);
    v_store_id := null;
    v_match_type := null;
    v_match_confidence := 1;
    v_match_input_source := 'primary_vision';
    v_product_ids := array[]::uuid[];
    v_selected_product_id := null;

    if v_index is null then
      continue;
    end if;

    if v_normalized_store_name <> '' then
      select case when count(*) = 1 then min(id) else null end
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
      select case when count(*) = 1 then min(id) else null end
      into v_store_id
      from public.market_stores
      where public.market_store_chain_key(store_name) = v_store_chain
        and normalized_city = v_normalized_store_city;
    end if;

    if v_barcode is not null then
      select coalesce(array_agg(distinct id), array[]::uuid[])
      into v_product_ids
      from public.market_products
      where barcode = v_barcode;

      if cardinality(v_product_ids) = 1 then
        v_match_type := 'barcode_exact';
        v_match_input_source := 'barcode';
        v_selected_product_id := v_product_ids[1];
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
      with scoped_aliases as (
        select
          aliases.product_id,
          case
            when aliases.scope = 'store'
              and v_store_id is not null
              and aliases.store_id = v_store_id
                then 3
            when aliases.scope = 'chain'
              and v_store_chain <> ''
              and aliases.store_chain_key = v_store_chain
                then 2
            when aliases.scope = 'global'
                then 1
            else 0
          end as scope_rank
        from public.market_product_aliases aliases
        where aliases.normalized_raw_label = v_normalized_name
          and coalesce(aliases.status, 'active') = 'active'
          and (
            (aliases.scope = 'store' and v_store_id is not null and aliases.store_id = v_store_id)
            or (aliases.scope = 'chain' and v_store_chain <> '' and aliases.store_chain_key = v_store_chain)
            or aliases.scope = 'global'
          )
      ),
      best_scope as (
        select max(scope_rank) as best_scope_rank
        from scoped_aliases
      )
      select coalesce(array_agg(distinct scoped_aliases.product_id), array[]::uuid[])
      into v_product_ids
      from scoped_aliases
      cross join best_scope
      where scoped_aliases.scope_rank = best_scope.best_scope_rank
        and scoped_aliases.scope_rank > 0;

      if cardinality(v_product_ids) = 1 then
        v_match_type := 'alias_exact';
        v_match_input_source := 'primary_vision';
        v_selected_product_id := v_product_ids[1];
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
        v_match_input_source := 'primary_vision';
        v_selected_product_id := v_product_ids[1];
      elsif cardinality(v_product_ids) > 1 then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'index', v_index,
          'market_matched', false,
          'market_unmatched_reason', 'ambiguous_normalized_name'
        ));
        continue;
      end if;
    end if;

    if v_match_type is null
      and v_normalized_name <> ''
      and v_observed_price is not null
      and v_observed_price > 0
      and v_store_chain <> ''
    then
      with input_names as (
        select
          v_normalized_name::text as candidate_name,
          'primary_vision'::text as input_source,
          1.00::numeric as source_weight
        where v_normalized_name <> ''

        union all

        select
          alternate.candidate_name,
          'alternate_ocr'::text as input_source,
          0.96::numeric as source_weight
        from (
          select distinct
            public.market_normalize_text(value)::text as candidate_name
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(v_item->'alternate_names') = 'array'
                then v_item->'alternate_names'
              else '[]'::jsonb
            end
          ) names(value)
          where public.market_normalize_text(value) <> ''
            and public.market_normalize_text(value) <> v_normalized_name
          limit 4
        ) alternate
      ),
      label_scores as (
        select
          p.id,
          p.canonical_name,
          p.brand,
          p.category,
          p.subcategory,
          p.package_format,
          coalesce(max(
            case when inputs.input_source = 'primary_vision' then
              greatest(
                similarity(p.normalized_name, inputs.candidate_name),
                coalesce(similarity(a.normalized_raw_label, inputs.candidate_name), 0)
              ) * inputs.source_weight
            else 0 end
          ), 0)::numeric as primary_lexical_score,
          coalesce(max(
            case when inputs.input_source = 'alternate_ocr' then
              greatest(
                similarity(p.normalized_name, inputs.candidate_name),
                coalesce(similarity(a.normalized_raw_label, inputs.candidate_name), 0)
              ) * inputs.source_weight
            else 0 end
          ), 0)::numeric as alternate_lexical_score
        from public.market_products p
        cross join input_names inputs
        left join public.market_product_aliases a
          on a.product_id = p.id
         and coalesce(a.status, 'active') = 'active'
        group by
          p.id,
          p.canonical_name,
          p.brand,
          p.category,
          p.subcategory,
          p.package_format,
          p.normalized_name
      ),
      label_best as (
        select
          label_scores.*,
          greatest(primary_lexical_score, alternate_lexical_score)::numeric
            as lexical_score,
          case
            when alternate_lexical_score > primary_lexical_score
              then 'alternate_ocr'
            else 'primary_vision'
          end as match_input_source
        from label_scores
        where greatest(primary_lexical_score, alternate_lexical_score) >= 0.25
      ),
      context_stats as (
        select
          labels.*,
          coalesce(
            bool_or(stores.id = v_store_id)
              filter (where observations.id is not null),
            false
          ) as same_store_seen,
          coalesce(
            bool_or(
              public.market_store_chain_key(stores.store_name) = v_store_chain
            ) filter (where observations.id is not null),
            false
          ) as same_chain_seen,
          min(
            abs(observations.price - v_observed_price)
            / greatest(v_observed_price, 0.01)
          ) filter (
            where observations.price > 0
              and (
                (v_store_id is not null and stores.id = v_store_id)
                or public.market_store_chain_key(stores.store_name) = v_store_chain
              )
          ) as price_difference_ratio
        from label_best labels
        left join public.market_price_observations observations
          on observations.product_id = labels.id
        left join public.market_stores stores
          on stores.id = observations.store_id
        group by
          labels.id,
          labels.canonical_name,
          labels.brand,
          labels.category,
          labels.subcategory,
          labels.package_format,
          labels.primary_lexical_score,
          labels.alternate_lexical_score,
          labels.lexical_score,
          labels.match_input_source
      ),
      scored_base as (
        select
          context_stats.*,
          case
            when same_store_seen then 'same_store'
            when same_chain_seen then 'same_chain'
            else null
          end as store_scope,
          greatest(
            0,
            1 - least(coalesce(price_difference_ratio, 1), 0.25) / 0.25
          )::numeric as price_score
        from context_stats
        where price_difference_ratio is not null
          and (same_store_seen or same_chain_seen)
      ),
      scored as (
        select
          scored_base.*,
          case
            when store_scope = 'same_store' then (
              0.60 * lexical_score
              + 0.28 * price_score
              + 0.12
            )
            else (
              0.62 * lexical_score
              + 0.28 * price_score
              + 0.10
            )
          end::numeric as match_score
        from scored_base
      ),
      eligible as (
        select *
        from scored
        where (
          match_input_source = 'primary_vision'
          and (
            (
              store_scope = 'same_store'
              and (
                (
                  lexical_score >= 0.45
                  and price_difference_ratio <= 0.20
                  and match_score >= 0.66
                )
                or (
                  lexical_score >= 0.34
                  and price_difference_ratio <= 0.03
                  and match_score >= 0.60
                )
              )
            )
            or (
              store_scope = 'same_chain'
              and lexical_score >= 0.60
              and price_difference_ratio <= 0.12
              and match_score >= 0.75
            )
          )
        )
        or (
          match_input_source = 'alternate_ocr'
          and (
            (
              store_scope = 'same_store'
              and (
                (
                  lexical_score >= 0.42
                  and price_difference_ratio <= 0.03
                  and match_score >= 0.64
                )
                or (
                  lexical_score >= 0.58
                  and price_difference_ratio <= 0.12
                  and match_score >= 0.72
                )
              )
            )
            or (
              store_scope = 'same_chain'
              and lexical_score >= 0.70
              and price_difference_ratio <= 0.08
              and match_score >= 0.80
            )
          )
        )
      ),
      ranked as (
        select
          eligible.*,
          row_number() over (
            order by
              match_score desc,
              lexical_score desc,
              price_difference_ratio asc,
              id
          ) as rank_number,
          lead(match_score) over (
            order by
              match_score desc,
              lexical_score desc,
              price_difference_ratio asc,
              id
          ) as second_match_score
        from eligible
      )
      select *
      into v_candidate
      from ranked
      where rank_number = 1;

      if found then
        v_margin := v_candidate.match_score
          - coalesce(v_candidate.second_match_score, 0);
        v_required_margin := case
          when v_candidate.match_input_source = 'alternate_ocr' then 0.14
          when v_candidate.store_scope = 'same_chain' then 0.10
          when v_candidate.lexical_score < 0.45 then 0.12
          else 0.08
        end;

        if v_candidate.second_match_score is not null
          and v_margin < v_required_margin
        then
          v_result := v_result || jsonb_build_array(jsonb_build_object(
            'index', v_index,
            'market_matched', false,
            'market_unmatched_reason', 'ambiguous_contextual_match'
          ));
          continue;
        end if;

        v_selected_product_id := v_candidate.id;
        v_match_input_source := v_candidate.match_input_source;
        v_match_type := case
          when v_candidate.store_scope = 'same_store'
            and v_candidate.match_input_source = 'alternate_ocr'
              then 'contextual_same_store_alt_ocr'
          when v_candidate.store_scope = 'same_chain'
            and v_candidate.match_input_source = 'alternate_ocr'
              then 'contextual_same_chain_alt_ocr'
          when v_candidate.store_scope = 'same_store'
            then 'contextual_same_store'
          else 'contextual_same_chain'
        end;
        v_match_confidence := least(
          0.99,
          greatest(0.01, v_candidate.match_score)
        );
      end if;
    end if;

    if v_match_type is null or v_selected_product_id is null then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'market_matched', false,
        'market_unmatched_reason', 'not_found'
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
    where id = v_selected_product_id;

    if v_product.id is null then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'market_matched', false,
        'market_unmatched_reason', 'product_missing'
      ));
      continue;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'market_matched', true,
      'market_product_id', v_product.id,
      'market_match_type', v_match_type,
      'market_match_confidence', v_match_confidence,
      'market_match_input_source', v_match_input_source,
      'market_canonical_name', v_product.canonical_name,
      'market_brand', v_product.brand,
      'market_category', v_product.category,
      'market_subcategory', v_product.subcategory,
      'market_package_format', v_product.package_format
    ));
  end loop;

  return v_result;
end;
$resolver$;

revoke execute on function public.market_resolve_exact_products(jsonb) from public;
revoke execute on function public.market_resolve_exact_products(jsonb) from anon;
revoke execute on function public.market_resolve_exact_products(jsonb) from authenticated;
grant execute on function public.market_resolve_exact_products(jsonb) to service_role;

comment on column public.market_product_aliases.scope is
  'Portee active de l alias: magasin, chaine ou globale.';
comment on column public.market_product_aliases.store_id is
  'Magasin cible lorsque scope = store.';
comment on column public.market_product_aliases.store_chain_key is
  'Cle de chaine lorsque scope = chain.';
comment on column public.market_product_aliases.status is
  'Etat de validation de l alias actif.';
comment on column public.market_product_aliases.evidence is
  'Preuves et provenance structurees de la liaison alias -> produit canonique.';
comment on column public.market_product_aliases.verified_at is
  'Date de verification humaine ou automatique de la liaison.';

commit;
