-- BudgetKazPei
-- Safe follow-up for retail auto-publication.
--
-- Problem:
-- a candidate may be commercially valid but have
-- package_format_mismatch_requires_review because an existing product
-- has a different package format. In that case we must NOT reuse the
-- incompatible product.
--
-- Safe behavior:
-- when the candidate has no matched_market_product_id, has a known
-- package format, no validation error, and its ONLY business warning is
-- package_format_mismatch_requires_review, create/resolve a distinct
-- reference product from the candidate itself. The existing helper
-- retail_create_reference_product_from_candidate() then records the
-- new reference and clears the stale mismatch warning.
--
-- All other warnings remain review-blocking.

begin;

create or replace function public.retail_prepare_safe_unmatched_candidates(
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
  v_product_id uuid;
  v_prepared_ids uuid[] := '{}'::uuid[];
  v_skipped_ids uuid[] := '{}'::uuid[];
  v_failed_ids uuid[] := '{}'::uuid[];
  v_requested_limit integer := greatest(1, least(coalesce(p_limit, 1000), 5000));
begin
  if current_user <> 'postgres'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'retail safe candidate preparation requires postgres or service_role'
      using errcode = '42501';
  end if;

  if to_regprocedure('public.retail_create_reference_product_from_candidate(uuid)') is null then
    raise exception 'retail_create_reference_product_from_candidate(uuid) is required';
  end if;

  for v_candidate in
    select c.*
    from public.retail_price_candidates c
    where c.status = 'needs_review'
      and c.matched_market_product_id is null
      and c.current_price is not null
      and c.current_price > 0
      and nullif(trim(coalesce(c.product_name, '')), '') is not null
      and nullif(trim(coalesce(c.package_format, '')), '') is not null
      and coalesce(jsonb_array_length(coalesce(c.validation_errors, '[]'::jsonb)), 0) = 0
      and exists (
        select 1
        from jsonb_array_elements_text(coalesce(c.match_warnings, '[]'::jsonb)) warning(value)
        where warning.value = 'package_format_mismatch_requires_review'
      )
      and not exists (
        select 1
        from jsonb_array_elements_text(coalesce(c.match_warnings, '[]'::jsonb)) warning(value)
        where warning.value not in (
          'matching_backend_unavailable_in_local_session',
          'package_format_mismatch_requires_review'
        )
      )
      and (p_retailer_slug is null or c.retailer_slug = p_retailer_slug)
      and (p_source_run_id is null or c.source_run_id = p_source_run_id)
    order by c.created_at, c.id
    limit v_requested_limit
    for update skip locked
  loop
    begin
      v_product_id := public.retail_create_reference_product_from_candidate(v_candidate.id);

      if v_product_id is null then
        v_skipped_ids := array_append(v_skipped_ids, v_candidate.id);
        continue;
      end if;

      if exists (
        select 1
        from public.retail_price_candidates c
        where c.id = v_candidate.id
          and c.matched_market_product_id = v_product_id
          and coalesce(jsonb_array_length(coalesce(c.match_warnings, '[]'::jsonb)), 0) = 0
      ) then
        v_prepared_ids := array_append(v_prepared_ids, v_candidate.id);
      else
        v_skipped_ids := array_append(v_skipped_ids, v_candidate.id);
      end if;

    exception
      when others then
        v_failed_ids := array_append(v_failed_ids, v_candidate.id);
    end;
  end loop;

  return jsonb_build_object(
    'retailer_slug', p_retailer_slug,
    'source_run_id', p_source_run_id,
    'prepared_candidate_ids', to_jsonb(coalesce(v_prepared_ids, '{}'::uuid[])),
    'skipped_candidate_ids', to_jsonb(coalesce(v_skipped_ids, '{}'::uuid[])),
    'failed_candidate_ids', to_jsonb(coalesce(v_failed_ids, '{}'::uuid[]))
  );
end;
$$;

alter function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer) owner to postgres;
revoke all on function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer)
  to service_role, postgres;

comment on function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer) is
  'Creates/resolves a distinct reference product only when an otherwise-clean candidate is blocked solely by package_format_mismatch_requires_review and has no matched market product. Other warnings remain review-blocking.';

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
  v_preparation jsonb := '{}'::jsonb;
  v_observed jsonb := '{}'::jsonb;
  v_promotions jsonb := '{}'::jsonb;
begin
  if current_user <> 'postgres'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'retail safe auto publication requires postgres or service_role'
      using errcode = '42501';
  end if;

  v_preparation := public.retail_prepare_safe_unmatched_candidates(
    p_retailer_slug,
    p_source_run_id,
    p_limit
  );

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
    'preparation', coalesce(v_preparation, '{}'::jsonb),
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
  'Runs safe unmatched-product preparation first, then safe observed-price and promotion publication.';

commit;