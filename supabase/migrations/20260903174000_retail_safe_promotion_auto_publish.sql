-- BudgetKazPei
-- Safe retail promotion auto-publication.
--
-- Safety rules:
--   - only commercially proven promotions are eligible;
--   - validation_errors must be empty;
--   - the only tolerated warning is matching_backend_unavailable_in_local_session;
--   - brand/package mismatches stay in needs_review;
--   - existing publication logic is reused.

create or replace function public.retail_auto_publish_safe_promotions(
  p_retailer_slug text default null,
  p_source_run_id uuid default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_market_product_id uuid;
  v_approved_ids uuid[] := '{}'::uuid[];
  v_skipped_ids uuid[] := '{}'::uuid[];
  v_failed_ids uuid[] := '{}'::uuid[];
  v_clean_warnings jsonb;
  v_publish_function text;
  v_publish_result jsonb := '{}'::jsonb;
  v_requested_limit integer := greatest(1, least(coalesce(p_limit, 500), 5000));
begin
  if current_user <> 'postgres'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'retail safe auto publication requires postgres or service_role'
      using errcode = '42501';
  end if;

  select p.proname
    into v_publish_function
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.pronargs = 1
    and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid[]'
    and pg_catalog.pg_get_function_result(p.oid) = 'jsonb'
    and p.proname like 'retail%publish%'
    and pg_catalog.pg_get_functiondef(p.oid) ilike '%approved_promotion%'
    and pg_catalog.pg_get_functiondef(p.oid) ilike '%published_promotion_id%'
  order by
    case
      when p.proname = 'retail_publish_promotion_candidates' then 0
      else 1
    end,
    p.proname
  limit 1;

  if v_publish_function is null then
    raise exception 'safe retail auto publication could not locate the existing promotion publisher';
  end if;

  for v_candidate in
    select c.*
    from public.retail_price_candidates c
    where c.status = 'needs_review'
      and c.price_type = 'promotion'
      and c.promotion_proven is true
      and c.promotion_evidence is not null
      and c.current_price is not null
      and c.current_price > 0
      and c.published_promotion_id is null
      and c.reviewed_at is null
      and coalesce(jsonb_array_length(coalesce(c.validation_errors, '[]'::jsonb)), 0) = 0
      and not exists (
        select 1
        from jsonb_array_elements_text(coalesce(c.match_warnings, '[]'::jsonb)) as warning(value)
        where warning.value <> 'matching_backend_unavailable_in_local_session'
      )
      and (p_retailer_slug is null or c.retailer_slug = p_retailer_slug)
      and (p_source_run_id is null or c.source_run_id = p_source_run_id)
    order by c.created_at, c.id
    limit v_requested_limit
    for update skip locked
  loop
    begin
      v_market_product_id := v_candidate.matched_market_product_id;

      if v_market_product_id is null then
        v_market_product_id :=
          public.retail_create_reference_product_from_candidate(v_candidate.id);
      end if;

      if v_market_product_id is null then
        v_skipped_ids := array_append(v_skipped_ids, v_candidate.id);
        continue;
      end if;

      select coalesce(jsonb_agg(to_jsonb(warning.value)), '[]'::jsonb)
        into v_clean_warnings
      from jsonb_array_elements_text(
        coalesce(
          (select match_warnings
           from public.retail_price_candidates
           where id = v_candidate.id),
          '[]'::jsonb
        )
      ) as warning(value)
      where warning.value <> 'matching_backend_unavailable_in_local_session';

      if exists (
        select 1
        from public.retail_price_candidates c
        where c.id = v_candidate.id
          and (
            c.promotion_proven is not true
            or c.promotion_evidence is null
            or c.current_price is null
            or c.current_price <= 0
            or coalesce(jsonb_array_length(coalesce(c.validation_errors, '[]'::jsonb)), 0) <> 0
            or coalesce(jsonb_array_length(coalesce(v_clean_warnings, '[]'::jsonb)), 0) <> 0
            or c.matched_market_product_id is null
          )
      ) then
        v_skipped_ids := array_append(v_skipped_ids, v_candidate.id);
        continue;
      end if;

      update public.retail_price_candidates
      set
        status = 'approved_promotion',
        match_warnings = coalesce(v_clean_warnings, '[]'::jsonb),
        updated_at = now()
      where id = v_candidate.id
        and status = 'needs_review'
        and reviewed_at is null;

      if found then
        v_approved_ids := array_append(v_approved_ids, v_candidate.id);
      else
        v_skipped_ids := array_append(v_skipped_ids, v_candidate.id);
      end if;

    exception
      when others then
        v_failed_ids := array_append(v_failed_ids, v_candidate.id);
    end;
  end loop;

  if coalesce(array_length(v_approved_ids, 1), 0) > 0 then
    execute format('select public.%I($1)', v_publish_function)
      into v_publish_result
      using v_approved_ids;
  end if;

  return jsonb_build_object(
    'retailer_slug', p_retailer_slug,
    'source_run_id', p_source_run_id,
    'publisher', v_publish_function,
    'approved_candidate_ids', to_jsonb(coalesce(v_approved_ids, '{}'::uuid[])),
    'skipped_candidate_ids', to_jsonb(coalesce(v_skipped_ids, '{}'::uuid[])),
    'failed_candidate_ids', to_jsonb(coalesce(v_failed_ids, '{}'::uuid[])),
    'publication', coalesce(v_publish_result, '{}'::jsonb)
  );
end;
$$;

alter function public.retail_auto_publish_safe_promotions(text, uuid, integer) owner to postgres;
revoke all on function public.retail_auto_publish_safe_promotions(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.retail_auto_publish_safe_promotions(text, uuid, integer)
  to service_role, postgres;

comment on function public.retail_auto_publish_safe_promotions(text, uuid, integer) is
  'Backend-only safe auto publication for proven retail promotions. Only matching_backend_unavailable_in_local_session is tolerated; all business matching warnings stay in review.';

do $$
declare
  v_result jsonb;
begin
  v_result := public.retail_auto_publish_safe_promotions(
    'leader-price-reunion',
    null,
    500
  );
  raise notice 'BudgetKazPei Leader Price safe promotion catch-up: %', v_result;
end;
$$;