-- BudgetKazPei free discovery: three scans during first 30 days, one monthly thereafter.
-- Existing Premium and Premium+ account rows remain eligible for 100 scans/month.
CREATE OR REPLACE FUNCTION public.reserve_receipt_scan(p_request_id uuid, p_scan_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_month_key text := public.receipt_scan_month_key();
  v_plan text;
  v_limit integer;
  v_usage public.scan_usage%rowtype;
  v_is_trial boolean := false;
  v_signup_month text := '';
  v_trial_used integer := 0;
  v_request public.receipt_scan_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_scan_type not in ('single', 'long_receipt') then
    raise exception 'invalid_scan_type' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 240718));
  select (now() < u.created_at + interval '30 days'),
         to_char(u.created_at at time zone 'Indian/Reunion','YYYY-MM')
    into v_is_trial, v_signup_month
    from auth.users u where u.id=v_user_id;
  v_is_trial := coalesce(v_is_trial,false);


  select * into v_request
  from public.receipt_scan_requests
  where user_id = v_user_id
    and request_id = p_request_id
    and scan_type = p_scan_type
  for update;

  if found and v_request.status in ('reserved', 'completed') then
    select * into v_usage
    from public.scan_usage
    where user_id = v_user_id and month_key = v_month_key;

    return jsonb_build_object(
      'allowed', true,
      'idempotent', true,
      'reservation_id', v_request.id,
      'request_id', v_request.request_id,
      'status', v_request.status,
      'plan', v_request.plan,
      'limit', (case when v_request.plan='free' and v_is_trial then 3 else public.receipt_scan_plan_limit(v_request.plan) end),
      'remaining', greatest(public.receipt_scan_plan_limit(v_request.plan) - coalesce(v_usage.ai_scan_count, 0), 0)
    );
  end if;

  v_plan := public.receipt_scan_resolve_plan(v_user_id);
  if v_plan = 'free' and v_is_trial then
    select coalesce(sum(ai_scan_count),0) into v_trial_used
      from public.scan_usage
      where user_id = v_user_id
        and month_key >= v_signup_month
        and month_key <= v_month_key;
  end if;
  v_limit := case when v_plan='free' and v_is_trial then 3
                  else public.receipt_scan_plan_limit(v_plan) end;

  insert into public.scan_usage (
    user_id,
    month_key,
    scan_count,
    ai_scan_count,
    manual_count,
    plan,
    last_scan_at,
    updated_at
  )
  values (v_user_id, v_month_key, 0, 0, 0, v_plan, null, now())
  on conflict (user_id, month_key) do nothing;

  select * into v_usage
  from public.scan_usage
  where user_id = v_user_id and month_key = v_month_key
  for update;

  if coalesce(v_usage.ai_scan_count, 0) >= v_limit or (v_plan='free' and v_is_trial and v_trial_used >= 3) then
    return jsonb_build_object(
      'allowed', false,
      'reason', public.receipt_scan_limit_reason(v_plan),
      'plan', v_plan,
      'limit', v_limit,
      'remaining', 0
    );
  end if;

  update public.scan_usage
  set scan_count = scan_count + 1,
      ai_scan_count = ai_scan_count + 1,
      plan = v_plan,
      last_scan_at = now(),
      updated_at = now()
  where id = v_usage.id
  returning * into v_usage;

  insert into public.receipt_scan_requests (
    user_id,
    request_id,
    scan_type,
    status,
    quota_counted,
    plan,
    month_key,
    reserved_at,
    updated_at
  )
  values (
    v_user_id,
    p_request_id,
    p_scan_type,
    'reserved',
    true,
    v_plan,
    v_month_key,
    now(),
    now()
  )
  on conflict (user_id, request_id, scan_type)
  do update set
    status = 'reserved',
    quota_counted = true,
    plan = excluded.plan,
    month_key = excluded.month_key,
    reserved_at = now(),
    released_at = null,
    release_reason = null,
    updated_at = now()
  returning * into v_request;

  return jsonb_build_object(
    'allowed', true,
    'idempotent', false,
    'reservation_id', v_request.id,
    'request_id', v_request.request_id,
    'status', v_request.status,
    'plan', v_plan,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_usage.ai_scan_count, 0)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_scan_usage(p_kind text DEFAULT 'ai'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_month_key text := public.receipt_scan_month_key();
  v_plan text;
  v_limit integer;
  v_usage public.scan_usage%rowtype;
  v_is_trial boolean := false;
  v_signup_month text := '';
  v_trial_used integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_kind not in ('ai', 'manual') then
    raise exception 'invalid_scan_usage_kind' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 240718));
  select (now() < u.created_at + interval '30 days'),
         to_char(u.created_at at time zone 'Indian/Reunion','YYYY-MM')
    into v_is_trial, v_signup_month
    from auth.users u where u.id=v_user_id;
  v_is_trial := coalesce(v_is_trial,false);


  v_plan := public.receipt_scan_resolve_plan(v_user_id);
  if v_plan = 'free' and v_is_trial then
    select coalesce(sum(ai_scan_count),0) into v_trial_used
      from public.scan_usage
      where user_id = v_user_id
        and month_key >= v_signup_month
        and month_key <= v_month_key;
  end if;
  v_limit := case when v_plan='free' and v_is_trial then 3
                  else public.receipt_scan_plan_limit(v_plan) end;

  insert into public.scan_usage (
    user_id,
    month_key,
    scan_count,
    ai_scan_count,
    manual_count,
    plan,
    last_scan_at,
    updated_at
  )
  values (v_user_id, v_month_key, 0, 0, 0, v_plan, null, now())
  on conflict (user_id, month_key) do nothing;

  select * into v_usage
  from public.scan_usage
  where user_id = v_user_id and month_key = v_month_key
  for update;

  if p_kind = 'ai' and (coalesce(v_usage.ai_scan_count, 0) >= v_limit or (v_plan='free' and v_is_trial and v_trial_used >= 3)) then
    return jsonb_build_object(
      'allowed', false,
      'reason', public.receipt_scan_limit_reason(v_plan),
      'plan', v_plan,
      'limit', v_limit,
      'remaining', 0
    );
  end if;

  update public.scan_usage
  set scan_count = scan_count + 1,
      ai_scan_count = ai_scan_count + case when p_kind = 'ai' then 1 else 0 end,
      manual_count = manual_count + case when p_kind = 'manual' then 1 else 0 end,
      plan = v_plan,
      last_scan_at = now(),
      updated_at = now()
  where id = v_usage.id
  returning * into v_usage;

  return jsonb_build_object(
    'allowed', true,
    'plan', v_plan,
    'limit', v_limit,
    'used', v_usage.ai_scan_count,
    'manual_used', v_usage.manual_count,
    'remaining', greatest(v_limit - v_usage.ai_scan_count, 0)
  );
end;
$function$
;


-- Read-only current scan entitlement. Counters and trial logic are owned by
-- the server; the free trial is three total scans across the first 30 days,
-- followed by the existing discovery allowance of one per calendar month.
create or replace function public.get_receipt_scan_access()
returns jsonb
language plpgsql security definer
set search_path to 'public','auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
  v_limit integer;
  v_used integer := 0;
  v_is_trial boolean := false;
  v_signup_month text := '';
  v_month_key text := public.receipt_scan_month_key();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode='28000';
  end if;
  v_plan := public.receipt_scan_resolve_plan(v_user_id);
  select (now() < u.created_at + interval '30 days'),
         to_char(u.created_at at time zone 'Indian/Reunion','YYYY-MM')
    into v_is_trial,v_signup_month
    from auth.users u where u.id=v_user_id;
  v_is_trial := coalesce(v_is_trial,false) and v_plan='free';
  v_limit := case when v_is_trial then 3 else public.receipt_scan_plan_limit(v_plan) end;
  if v_is_trial then
    select coalesce(sum(ai_scan_count),0) into v_used
    from public.scan_usage where user_id=v_user_id
      and month_key>=v_signup_month and month_key<=v_month_key;
  else
    select coalesce(ai_scan_count,0) into v_used
    from public.scan_usage where user_id=v_user_id and month_key=v_month_key;
    v_used := coalesce(v_used,0);
  end if;
  return jsonb_build_object('plan',v_plan,'used',v_used,'limit',v_limit,
    'remaining',greatest(v_limit-v_used,0),'discovery',v_is_trial);
end
$$;
revoke all on function public.get_receipt_scan_access() from public, anon;
grant execute on function public.get_receipt_scan_access() to authenticated, service_role;
