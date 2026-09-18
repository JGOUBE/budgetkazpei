-- BudgetKazPei
-- Retail auto-publication V1.5
--
-- Reuse the single exact semantic market product when the only business
-- mismatch is package-format wording, e.g. "1 L" vs "Contenu : 1 L".
--
-- Safety:
--   * exactly one semantic market product must match;
--   * same normalized name + brand + quantity + unit + pack count;
--   * barcode, if present on both sides, must not conflict;
--   * no validation errors;
--   * no other business warning;
--   * multiple matches remain in review.

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
  v_semantic_count integer;
  v_candidate_barcode text;
  v_prepared_ids uuid[] := '{}'::uuid[];
  v_skipped_ids uuid[] := '{}'::uuid[];
  v_failed_ids uuid[] := '{}'::uuid[];
  v_failed_reasons jsonb := '{}'::jsonb;
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
      and c.quantity_value is not null
      and c.quantity_value > 0
      and nullif(trim(coalesce(c.quantity_unit, '')), '') is not null
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
      v_product_id := null;
      v_semantic_count := 0;
      v_candidate_barcode :=
        nullif(regexp_replace(coalesce(v_candidate.barcode, ''), '\D', '', 'g'), '');

      select count(*), min(p.id)
      into v_semantic_count, v_product_id
      from public.market_products p
      where p.normalized_name = v_candidate.normalized_product_name
        and p.normalized_brand =
          public.market_normalize_text(coalesce(v_candidate.brand, ''))
        and p.package_size_value is not distinct from v_candidate.quantity_value
        and public.market_normalize_text(coalesce(p.package_size_unit, '')) =
          public.market_normalize_text(coalesce(v_candidate.quantity_unit, ''))
        and p.package_count is not distinct from v_candidate.pack_count
        and (
          v_candidate_barcode is null
          or p.barcode is null
          or regexp_replace(coalesce(p.barcode, ''), '\D', '', 'g') = v_candidate_barcode
        );

      if v_semantic_count = 1 and v_product_id is not null then
        update public.retail_price_candidates
        set
          matched_market_product_id = v_product_id,
          match_method = 'auto_exact_identity_quantity',
          match_confidence = 1,
          match_warnings = '[]'::jsonb,
          updated_at = now()
        where id = v_candidate.id
          and status = 'needs_review'
          and matched_market_product_id is null;

        if found then
          v_prepared_ids := array_append(v_prepared_ids, v_candidate.id);
        else
          v_skipped_ids := array_append(v_skipped_ids, v_candidate.id);
        end if;

        continue;
      end if;

      if v_semantic_count > 1 then
        v_skipped_ids := array_append(v_skipped_ids, v_candidate.id);
        continue;
      end if;

      v_product_id :=
        public.retail_create_reference_product_from_candidate(v_candidate.id);

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
        v_failed_reasons :=
          v_failed_reasons ||
          jsonb_build_object(
            v_candidate.id::text,
            jsonb_build_object(
              'sqlstate', sqlstate,
              'message', sqlerrm
            )
          );
    end;
  end loop;

  return jsonb_build_object(
    'retailer_slug', p_retailer_slug,
    'source_run_id', p_source_run_id,
    'prepared_candidate_ids', to_jsonb(coalesce(v_prepared_ids, '{}'::uuid[])),
    'skipped_candidate_ids', to_jsonb(coalesce(v_skipped_ids, '{}'::uuid[])),
    'failed_candidate_ids', to_jsonb(coalesce(v_failed_ids, '{}'::uuid[])),
    'failed_reasons', coalesce(v_failed_reasons, '{}'::jsonb)
  );
end;
$$;

alter function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer) owner to postgres;
revoke all on function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer)
  to service_role, postgres;

comment on function public.retail_prepare_safe_unmatched_candidates(text, uuid, integer) is
  'Safely reuses one exact semantic market product for package-format wording mismatches; ambiguous matches remain in review.';

commit;