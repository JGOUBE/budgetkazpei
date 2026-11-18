-- Hard, server-side cost guard for Mon Conseiller (La Réunion calendar).
-- Only the Edge Function service_role can reserve a paid request.
-- No client access or personal question content stored.
create table if not exists public.advisor_ai_request_guard (
  user_id uuid not null,
  period_kind text not null check (period_kind in ('hour_all','day_offtopic','month_offtopic')),
  period_key text not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_kind, period_key)
);
alter table public.advisor_ai_request_guard enable row level security;
revoke all on table public.advisor_ai_request_guard from public, anon, authenticated;
grant select, insert, update on table public.advisor_ai_request_guard to service_role;

create or replace function public.reserve_advisor_ai_request(
  p_user_id uuid,
  p_offtopic boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamp := timezone('Indian/Reunion', now());
  v_hour text := to_char(v_now, 'YYYY-MM-DD"T"HH24');
  v_day text := to_char(v_now, 'YYYY-MM-DD');
  v_month text := to_char(v_now, 'YYYY-MM');
  v_hour_used integer := 0;
  v_day_used integer := 0;
  v_month_used integer := 0;
  v_daily_limit constant integer := 5;
  v_monthly_limit constant integer := 20;
  v_hourly_limit constant integer := 30;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;
  -- Serialize concurrent reservations by the same authenticated user;
  -- avoid racing past the limit on multiple devices/tabs.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1974));

  select request_count into v_hour_used
  from public.advisor_ai_request_guard
  where user_id = p_user_id and period_kind = 'hour_all' and period_key = v_hour;
  v_hour_used := coalesce(v_hour_used, 0);

  if v_hour_used >= v_hourly_limit then
    return jsonb_build_object('allowed', false, 'code', 'hourly_rate_limit',
      'limit', v_hourly_limit, 'used', v_hour_used, 'scope', 'all');
  end if;

  if coalesce(p_offtopic, false) then
    select request_count into v_day_used
    from public.advisor_ai_request_guard
    where user_id = p_user_id and period_kind = 'day_offtopic' and period_key = v_day;
    v_day_used := coalesce(v_day_used, 0);

    select request_count into v_month_used
    from public.advisor_ai_request_guard
    where user_id = p_user_id and period_kind = 'month_offtopic' and period_key = v_month;
    v_month_used := coalesce(v_month_used, 0);

    if v_day_used >= v_daily_limit then
      return jsonb_build_object('allowed', false, 'code', 'offtopic_daily_limit',
        'limit', v_daily_limit, 'used', v_day_used, 'scope', 'offtopic');
    end if;
    if v_month_used >= v_monthly_limit then
      return jsonb_build_object('allowed', false, 'code', 'offtopic_monthly_limit',
        'limit', v_monthly_limit, 'used', v_month_used, 'scope', 'offtopic');
    end if;
  end if;

  insert into public.advisor_ai_request_guard(user_id,period_kind,period_key,request_count)
  values(p_user_id,'hour_all',v_hour,1)
  on conflict(user_id,period_kind,period_key) do update
    set request_count = public.advisor_ai_request_guard.request_count + 1,
        updated_at = now();

  if coalesce(p_offtopic, false) then
    insert into public.advisor_ai_request_guard(user_id,period_kind,period_key,request_count)
    values(p_user_id,'day_offtopic',v_day,1)
    on conflict(user_id,period_kind,period_key) do update
      set request_count = public.advisor_ai_request_guard.request_count + 1,
          updated_at = now();

    insert into public.advisor_ai_request_guard(user_id,period_kind,period_key,request_count)
    values(p_user_id,'month_offtopic',v_month,1)
    on conflict(user_id,period_kind,period_key) do update
      set request_count = public.advisor_ai_request_guard.request_count + 1,
          updated_at = now();
  end if;

  return jsonb_build_object(
    'allowed', true,
    'scope', case when coalesce(p_offtopic, false) then 'offtopic' else 'useful' end,
    'hourly_used', v_hour_used + 1,
    'offtopic_daily_used', case when p_offtopic then v_day_used + 1 else null end,
    'offtopic_monthly_used', case when p_offtopic then v_month_used + 1 else null end
  );
end;
$$;

revoke all on function public.reserve_advisor_ai_request(uuid,boolean) from public, anon, authenticated;
grant execute on function public.reserve_advisor_ai_request(uuid,boolean) to service_role;
