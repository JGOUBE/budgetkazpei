-- Retail promotions without a publishable commercial window must keep their
-- observed price, but must never create an active shopping promotion.

alter function public.retail_publish_promotion_candidates(uuid[])
  rename to retail_publish_promotion_candidates_active;

alter function public.retail_publish_promotion_candidates_active(uuid[])
  owner to postgres;
revoke all on function public.retail_publish_promotion_candidates_active(uuid[])
  from public, anon, authenticated;
grant execute on function public.retail_publish_promotion_candidates_active(uuid[])
  to postgres, service_role;

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
  v_active_result jsonb;
  v_observed_result jsonb;
  v_fallback_reason text;
  v_fallback_note text;
  v_created_ids uuid[] := '{}'::uuid[];
  v_updated_ids uuid[] := '{}'::uuid[];
  v_market_created_ids uuid[] := '{}'::uuid[];
  v_market_updated_ids uuid[] := '{}'::uuid[];
  v_ignored_ids uuid[] := '{}'::uuid[];
  v_observed_only_ids uuid[] := '{}'::uuid[];
  v_rejected_ids uuid[] := '{}'::uuid[];
  v_rejected_reasons jsonb := '{}'::jsonb;
begin
  if p_candidate_ids is null or array_length(p_candidate_ids, 1) is null then
    raise exception 'candidate ids are required' using errcode = '22023';
  end if;

  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'retail promotion publication requires an administrator account'
      using errcode = '42501';
  end if;

  foreach v_candidate_id in array p_candidate_ids loop
    begin
      select *
      into v_candidate
      from public.retail_price_candidates
      where id = v_candidate_id
      for update;

      if not found then
        v_rejected_ids := array_append(v_rejected_ids, v_candidate_id);
        v_rejected_reasons := v_rejected_reasons || jsonb_build_object(
          v_candidate_id::text,
          'retail price candidate not found'
        );
        continue;
      end if;

      if v_candidate.status = 'published' then
        if v_candidate.published_price_observation_id is null
           or v_candidate.published_promotion_id is null
           or v_candidate.published_market_observation_id is null then
          v_rejected_ids := array_append(v_rejected_ids, v_candidate.id);
          v_rejected_reasons := v_rejected_reasons || jsonb_build_object(
            v_candidate.id::text,
            'published retail promotion candidate is missing publication links'
          );
        else
          v_ignored_ids := array_append(v_ignored_ids, v_candidate.id);
        end if;
        continue;
      end if;

      if v_candidate.status <> 'approved_promotion'
         or v_candidate.promotion_proven is not true
         or v_candidate.promotion_evidence is null
         or v_candidate.current_price <= 0
         or v_candidate.matched_market_product_id is null then
        v_rejected_ids := array_append(v_rejected_ids, v_candidate.id);
        v_rejected_reasons := v_rejected_reasons || jsonb_build_object(
          v_candidate.id::text,
          'retail promotion candidate is missing publication requirements'
        );
        continue;
      end if;

      -- Classification uses the real current time only as a decision boundary.
      -- It is never written into starts_at or ends_at.
      if v_candidate.ends_at is not null and v_candidate.ends_at < now() then
        v_fallback_reason := 'expired';
        v_fallback_note := 'Promotion terminee - prix conserve comme prix observe.';
      elsif v_candidate.starts_at is null or v_candidate.ends_at is null then
        v_fallback_reason := 'dates_incomplete';
        v_fallback_note := 'Periode de promotion incomplete - prix conserve comme prix observe.';
      elsif v_candidate.ends_at < v_candidate.starts_at then
        v_fallback_reason := 'dates_incomplete';
        v_fallback_note := 'Periode de promotion incoherente - prix conserve comme prix observe.';
      elsif v_candidate.starts_at > now() then
        v_fallback_reason := 'not_active_yet';
        v_fallback_note := 'Promotion non active a la date de publication - prix conserve comme prix observe.';
      else
        v_fallback_reason := null;
        v_fallback_note := null;
      end if;

      if v_fallback_reason is not null then
        -- Convert the candidate before calling the existing observed-price
        -- pipeline. The review trigger therefore sees a coherent
        -- approved_price transition, and the market observation is also
        -- written with is_promotion = false.
        update public.retail_price_candidates
        set
          status = 'approved_price',
          price_type = 'observed_price',
          promotion_proven = false,
          promotion_evidence = null,
          published_promotion_id = null,
          review_notes = concat_ws(
            ' | ',
            nullif(trim(coalesce(review_notes, '')), ''),
            v_fallback_note
          ),
          updated_at = now()
        where id = v_candidate.id;

        -- A previous manually retried publication must not remain publicly
        -- active. Do not delete it: preserve the audit trail and deactivate
        -- only the stable promotion belonging to this candidate.
        update public.shopping_promotions
        set is_active = false,
            updated_at = now()
        where collector_source_slug = 'leader-price-reunion-retail'
          and external_key = format('retail-promo:%s', v_candidate.id);

        select public.retail_publish_price_candidates(array[v_candidate.id])
        into v_observed_result;

        v_observed_only_ids := array_append(v_observed_only_ids, v_candidate.id);
        continue;
      end if;

      -- Keep the already audited, idempotent active-promotion implementation.
      -- Calling it one candidate at a time gives batch publication per-item
      -- isolation: a bad candidate cannot abort valid candidates after it.
      select public.retail_publish_promotion_candidates_active(array[v_candidate.id])
      into v_active_result;

      v_created_ids := v_created_ids || ARRAY(
        select value::uuid
        from jsonb_array_elements_text(coalesce(v_active_result->'created', '[]'::jsonb))
      );
      v_updated_ids := v_updated_ids || ARRAY(
        select value::uuid
        from jsonb_array_elements_text(coalesce(v_active_result->'updated', '[]'::jsonb))
      );
      v_market_created_ids := v_market_created_ids || ARRAY(
        select value::uuid
        from jsonb_array_elements_text(coalesce(v_active_result->'market_created', '[]'::jsonb))
      );
      v_market_updated_ids := v_market_updated_ids || ARRAY(
        select value::uuid
        from jsonb_array_elements_text(coalesce(v_active_result->'market_updated', '[]'::jsonb))
      );
      v_ignored_ids := v_ignored_ids || ARRAY(
        select value::uuid
        from jsonb_array_elements_text(coalesce(v_active_result->'ignored', '[]'::jsonb))
      );
    exception
      when others then
        v_rejected_ids := array_append(v_rejected_ids, v_candidate_id);
        v_rejected_reasons := v_rejected_reasons || jsonb_build_object(
          v_candidate_id::text,
          sqlerrm
        );
    end;
  end loop;

  return jsonb_build_object(
    'created', to_jsonb(coalesce(v_created_ids, '{}'::uuid[])),
    'updated', to_jsonb(coalesce(v_updated_ids, '{}'::uuid[])),
    'market_created', to_jsonb(coalesce(v_market_created_ids, '{}'::uuid[])),
    'market_updated', to_jsonb(coalesce(v_market_updated_ids, '{}'::uuid[])),
    'ignored', to_jsonb(coalesce(v_ignored_ids, '{}'::uuid[])),
    'observed_only', to_jsonb(coalesce(v_observed_only_ids, '{}'::uuid[])),
    'rejected', to_jsonb(coalesce(v_rejected_ids, '{}'::uuid[])),
    'rejected_reasons', v_rejected_reasons
  );
end;
$$;

alter function public.retail_publish_promotion_candidates(uuid[]) owner to postgres;
revoke all on function public.retail_publish_promotion_candidates(uuid[]) from public, anon;
grant execute on function public.retail_publish_promotion_candidates(uuid[])
  to authenticated, service_role, postgres;
