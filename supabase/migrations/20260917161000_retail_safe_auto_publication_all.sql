-- BudgetKazPei
-- Safe automatic retail publication after collector imports.
--
-- Goals:
--   * create/reference a market product when the candidate is clean and unambiguous;
--   * auto-publish safe observed prices;
--   * reuse the existing safe promotion auto-publisher;
--   * keep ambiguous, mismatched or invalid candidates in needs_review.
--
-- Backend only: service_role/postgres.

begin;

create or replace function public.retail_auto_publish_safe_observed_prices(
  p_retailer_slug text default null,
  p_source_run_id uuid default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_market_product_id uuid;
  v_clean_warnings jsonb;
  v_approved_ids uuid[] := '{}'::uuid[];
  v_skipped_ids uuid[] := '{}'::uuid[];
  v_failed_ids uuid[] := '{}'::uuid[];
  v_publish_result jsonb := '{}'::jsonb;
  v_requested_limit integer := greatest(1, least(coalesce(p_limit, 1000), 5000));
begin
  if current_user <> 'postgres'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'retail safe observed-price auto publication requires postgres or service_role'
      using errcode = '42501';
  end if;

  if to_regprocedure('public.retail_create_reference_product_from_candidate(uuid)') is null then
    raise exception 'retail_create_reference_product_from_candidate(uuid) is required';
  end if;

  if to_regprocedure('public.retail_publish_price_candidates(uuid[])') is null then
    raise exception 'retail_publish_price_candidates(uuid[]) is required';
  end if;

  for v_candidate in
    select c.*
    from public.retail_price_candidates c
    where c.status = 'needs_review'
      and c.price_type = 'observed_price'
      and c.current_price is not null
      and c.current_price > 0
      and c.published_price_observation_id is null
      and c.reviewed_at is null
      and coalesce(jsonb_array_length(coalesce(c.validation_errors, '[]'::jsonb)), 0) = 0
      and not exists (
        select 1
        from jsonb_array_elements_text(coalesce(c.match_warnings, '[]'::jsonb)) warning(value)
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
      ) warning(value)
      where warning.value <> 'matching_backend_unavailable_in_local_session';

      if exists (
        select 1
        from public.retail_price_candidates c
        where c.id = v_candidate.id
          and (
            c.current_price is null
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
        status = 'approved_price',
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
    select public.retail_publish_price_candidates(v_approved_ids)
    into v_publish_result;
  end if;

  return jsonb_build_object(
    'retailer_slug', p_retailer_slug,
    'source_run_id', p_source_run_id,
    'approved_candidate_ids', to_jsonb(coalesce(v_approved_ids, '{}'::uuid[])),
    'skipped_candidate_ids', to_jsonb(coalesce(v_skipped_ids, '{}'::uuid[])),
    'failed_candidate_ids', to_jsonb(coalesce(v_failed_ids, '{}'::uuid[])),
    'publication', coalesce(v_publish_result, '{}'::jsonb)
  );
end;
$$;

alter function public.retail_auto_publish_safe_observed_prices(text, uuid, integer) owner to postgres;
revoke all on function public.retail_auto_publish_safe_observed_prices(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.retail_auto_publish_safe_observed_prices(text, uuid, integer)
  to service_role, postgres;

comment on function public.retail_auto_publish_safe_observed_prices(text, uuid, integer) is
  'Backend-only auto publication for clean observed retail prices. It may create a reference product from a candidate only when existing candidate validation/matching warnings are clean.';

create or replace function public.retail_auto_publish_safe_candidates(
  p_retailer_slug text default null,
  p_source_run_id uuid default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_observed jsonb := '{}'::jsonb;
  v_promotions jsonb := '{}'::jsonb;
begin
  if current_user <> 'postgres'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'retail safe auto publication requires postgres or service_role'
      using errcode = '42501';
  end if;

  v_observed := public.retail_auto_publish_safe_observed_prices(
    p_retailer_slug,
    p_source_run_id,
    p_limit
  );

  if to_regprocedure('public.retail_auto_publish_safe_promotions(text,uuid,integer)') is not null then
    v_promotions := public.retail_auto_publish_safe_promotions(
      p_retailer_slug,
      p_source_run_id,
      p_limit
    );
  end if;

  return jsonb_build_object(
    'retailer_slug', p_retailer_slug,
    'source_run_id', p_source_run_id,
    'observed_prices', coalesce(v_observed, '{}'::jsonb),
    'promotions', coalesce(v_promotions, '{}'::jsonb)
  );
end;
$$;

alter function public.retail_auto_publish_safe_candidates(text, uuid, integer) owner to postgres;
revoke all on function public.retail_auto_publish_safe_candidates(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.retail_auto_publish_safe_candidates(text, uuid, integer)
  to service_role, postgres;

comment on function public.retail_auto_publish_safe_candidates(text, uuid, integer) is
  'Runs safe auto-publication for both observed prices and proven promotions. Ambiguous or invalid candidates remain in needs_review.';

commit;