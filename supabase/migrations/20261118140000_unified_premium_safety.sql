-- Unified Premium safety (applied first on the production database).
-- The old premium_plus value remains accepted for existing Stripe subscriptions.
-- All counts and cost reservations are server-side; no customer message content is stored.
create table if not exists public.advisor_openai_reservations (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  state text not null default 'reserved' check (state in ('reserved', 'settled')),
  reserved_microeur bigint not null check (reserved_microeur between 1 and 100000),
  actual_microeur bigint check (actual_microeur >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  model text not null,
  updated_at timestamptz not null default now()
);
create index if not exists advisor_openai_reservations_user_created_idx
  on public.advisor_openai_reservations(user_id, created_at desc);
alter table public.advisor_openai_reservations enable row level security;
revoke all on table public.advisor_openai_reservations from public, anon, authenticated;
grant select, insert, update on table public.advisor_openai_reservations to service_role;

create or replace function public.reserve_advisor_openai(
  p_user_id uuid, p_request_id uuid, p_reserved_microeur bigint, p_model text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $fn$
declare
  v_now timestamptz := clock_timestamp();
  v_day_start timestamptz := (date_trunc('day',timezone('Indian/Reunion',clock_timestamp())) at time zone 'Indian/Reunion');
  v_month_start timestamptz := (date_trunc('month',timezone('Indian/Reunion',clock_timestamp())) at time zone 'Indian/Reunion');
  v_minute_count integer;
  v_hour_count integer;
  v_day_count integer;
  v_month_count integer;
  v_month_microeur bigint;
  v_code text := null;
begin
  if p_user_id is null or p_request_id is null or p_reserved_microeur is null
     or p_reserved_microeur < 1 or p_reserved_microeur > 100000
     or p_model is null or p_model not like 'gpt-4o-mini%' then
    return jsonb_build_object('allowed',false,'code','invalid_reservation');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,20261118));
  if exists(select 1 from public.advisor_openai_reservations where request_id=p_request_id) then
    return jsonb_build_object('allowed',false,'code','duplicate_request');
  end if;
  select
    count(*) filter(where created_at >= v_now - interval '1 minute'),
    count(*) filter(where created_at >= v_now - interval '1 hour'),
    count(*) filter(where created_at >= v_day_start),
    count(*) filter(where created_at >= v_month_start),
    coalesce(sum(case when state='settled' then actual_microeur else reserved_microeur end)
      filter(where created_at >= v_month_start),0)
  into v_minute_count,v_hour_count,v_day_count,v_month_count,v_month_microeur
  from public.advisor_openai_reservations
  where user_id=p_user_id and created_at>=v_month_start;

  if v_minute_count>=5 then v_code:='rate_minute';
  elsif v_hour_count>=30 then v_code:='rate_hour';
  elsif v_day_count>=100 then v_code:='rate_day';
  elsif v_month_count>=1200 then v_code:='safety_monthly_calls';
  elsif v_month_microeur + p_reserved_microeur > 1500000 then v_code:='safety_monthly_spend';
  end if;
  if v_code is not null then return jsonb_build_object('allowed',false,'code',v_code); end if;
  insert into public.advisor_openai_reservations(request_id,user_id,reserved_microeur,model)
  values(p_request_id,p_user_id,p_reserved_microeur,p_model);
  return jsonb_build_object('allowed',true,'request_id',p_request_id,
    'warning',v_month_count+1>=960 or v_month_microeur+p_reserved_microeur>=1200000);
end $fn$;

create or replace function public.settle_advisor_openai(
  p_request_id uuid, p_actual_microeur bigint,
  p_input_tokens integer default 0, p_output_tokens integer default 0
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $fn$
declare
  v_row public.advisor_openai_reservations%rowtype;
begin
  if p_request_id is null or p_actual_microeur is null or p_actual_microeur<0
     or p_input_tokens<0 or p_output_tokens<0 then
    return jsonb_build_object('ok',false,'code','invalid_settlement');
  end if;
  update public.advisor_openai_reservations
  set state='settled',actual_microeur=p_actual_microeur,
      input_tokens=p_input_tokens,output_tokens=p_output_tokens,updated_at=now()
  where request_id=p_request_id and state='reserved' returning * into v_row;
  if not found then return jsonb_build_object('ok',false,'code','not_reserved'); end if;
  return jsonb_build_object('ok',true,'over_reservation',p_actual_microeur>v_row.reserved_microeur);
end $fn$;

revoke all on function public.reserve_advisor_openai(uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.settle_advisor_openai(uuid,bigint,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_advisor_openai(uuid,uuid,bigint,text) to service_role;
grant execute on function public.settle_advisor_openai(uuid,bigint,integer,integer) to service_role;

create or replace function public.receipt_scan_plan_limit(p_plan text)
returns integer language sql immutable as $fn$
  select case when p_plan in ('premium','premium_plus') then 100 else 1 end
$fn$;
create or replace function public.receipt_scan_limit_reason(p_plan text)
returns text language sql immutable as $fn$
  select case when p_plan in ('premium','premium_plus') then 'scan_safety_limit_reached'
              else 'monthly_quota_reached' end
$fn$;

-- Active subscriptions win; a canceled subscription cannot inherit a stale premium flag.
create or replace function public.receipt_scan_resolve_plan(p_user_id uuid)
returns text language plpgsql security definer set search_path=public,auth
as $fn$
declare
  v_profile jsonb;
  v_subscription text;
  v_has_sub boolean;
  v_plan text;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  select us.plan into v_subscription from public.user_subscriptions us
  where us.user_id=p_user_id and us.status='active'
  order by us.updated_at desc limit 1;
  if v_subscription is not null then return public.receipt_scan_normalize_plan(v_subscription); end if;
  select exists(select 1 from public.user_subscriptions us where us.user_id=p_user_id) into v_has_sub;
  if v_has_sub then return 'free'; end if;
  select to_jsonb(p) into v_profile from public.profiles p where p.id=p_user_id;
  v_plan := coalesce(v_profile ->> 'plan',v_profile ->> 'subscription_plan','');
  if v_plan in ('premium','premium_plus') then return public.receipt_scan_normalize_plan(v_plan); end if;
  if lower(coalesce(v_profile ->> 'premium_plus','')) in ('true','1','yes') then return 'premium_plus'; end if;
  if lower(coalesce(v_profile ->> 'premium','')) in ('true','1','yes') or
     lower(coalesce(v_profile ->> 'is_premium','')) in ('true','1','yes') then return 'premium'; end if;
  return 'free';
end $fn$;
revoke execute on function public.receipt_scan_resolve_plan(uuid) from public,anon;
grant execute on function public.receipt_scan_resolve_plan(uuid) to authenticated,service_role;
