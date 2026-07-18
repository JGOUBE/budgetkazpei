create extension if not exists pgcrypto;

create table if not exists public.receipt_scan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  scan_type text not null,
  status text not null default 'reserved',
  quota_counted boolean not null default true,
  plan text not null default 'free',
  month_key text not null,
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_scan_requests_type_check check (scan_type in ('single', 'long_receipt')),
  constraint receipt_scan_requests_status_check check (status in ('reserved', 'completed', 'released')),
  constraint receipt_scan_requests_plan_check check (plan in ('free', 'premium', 'premium_plus')),
  unique (user_id, request_id, scan_type)
);

alter table public.receipt_scan_requests enable row level security;

drop policy if exists "receipt_scan_requests_select_own" on public.receipt_scan_requests;
create policy "receipt_scan_requests_select_own"
  on public.receipt_scan_requests for select
  using (auth.uid() = user_id);

drop policy if exists "receipt_scan_requests_insert_own" on public.receipt_scan_requests;
drop policy if exists "receipt_scan_requests_update_own" on public.receipt_scan_requests;
drop policy if exists "receipt_scan_requests_delete_own" on public.receipt_scan_requests;

create index if not exists receipt_scan_requests_user_created_idx
  on public.receipt_scan_requests (user_id, created_at desc);

create index if not exists receipt_scan_requests_status_idx
  on public.receipt_scan_requests (user_id, status, created_at desc);

create or replace function public.receipt_scan_month_key(p_now timestamptz default now())
returns text
language sql
stable
as $$
  -- Quotas commerciaux mensuels alignes sur l'heure locale de La Reunion.
  -- Le changement de periode suit le fuseau IANA Indian/Reunion.
  select to_char(p_now at time zone 'Indian/Reunion', 'YYYY-MM')
$$;

create or replace function public.receipt_scan_plan_limit(p_plan text)
returns integer
language sql
immutable
as $$
  -- Limites operationnelles serveur des scans IA mensuels.
  -- Gratuit reste provisoire jusqu'a validation du cout reel du moteur Python.
  -- Premium+ reste commercialement illimite : 50 est seulement un seuil
  -- interne anti-abus, jamais un quota commercial affiche.
  select case
    when p_plan = 'premium_plus' then 50
    when p_plan = 'premium' then 10
    else 1
  end
$$;

create or replace function public.receipt_scan_limit_reason(p_plan text)
returns text
language sql
immutable
as $$
  select case
    when p_plan = 'premium_plus' then 'scan_safety_limit_reached'
    else 'monthly_quota_reached'
  end
$$;

create or replace function public.receipt_scan_normalize_plan(p_plan text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_plan, ''))) in (
      'premium_plus',
      'premium+',
      'premium plus',
      'premium-plus'
    ) then 'premium_plus'
    when lower(trim(coalesce(p_plan, ''))) = 'premium' then 'premium'
    else 'free'
  end
$$;

create or replace function public.receipt_scan_resolve_plan(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile jsonb := null;
  v_subscription_plan text := null;
  v_existing_plan text := null;
  v_month_key text := public.receipt_scan_month_key();
  v_user_email text := null;
  v_has_subscription_user_id boolean := false;
  v_has_subscription_email boolean := false;
begin
  if to_regclass('auth.users') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'auth'
        and table_name = 'users'
        and column_name = 'id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'auth'
        and table_name = 'users'
        and column_name = 'email'
    )
  then
    execute 'select u.email from auth.users u where u.id = $1 limit 1'
      into v_user_email
      using p_user_id;
  end if;

  -- Source serveur prioritaire : abonnement actif persiste par le webhook Stripe.
  -- Si la table ou ses colonnes ne sont pas presentes localement, la resolution
  -- reste defensive et retombe sur profiles, puis scan_usage, puis free.
  if to_regclass('public.user_subscriptions') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'plan'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'status'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'updated_at'
    )
  then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'user_id'
    )
    into v_has_subscription_user_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_subscriptions'
        and column_name = 'email'
    )
    into v_has_subscription_email;
  end if;

  if v_has_subscription_user_id then
    execute '
      select us.plan
      from public.user_subscriptions us
      where us.user_id = $1
        and us.status = ''active''
      order by us.updated_at desc nulls last
      limit 1
    '
      into v_subscription_plan
      using p_user_id;
  end if;

  if v_subscription_plan is null
    and v_has_subscription_email
    and v_user_email is not null
  then
    execute '
      select us.plan
      from public.user_subscriptions us
      where lower(us.email) = lower($1)
        and us.status = ''active''
      order by us.updated_at desc nulls last
      limit 1
    '
      into v_subscription_plan
      using v_user_email;
  end if;

  select plan into v_existing_plan
  from public.scan_usage
  where user_id = p_user_id and month_key = v_month_key
  limit 1;

  if to_regclass('public.profiles') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'id'
    )
  then
    execute 'select to_jsonb(p) from public.profiles p where p.id = $1 limit 1'
      into v_profile
      using p_user_id;
  end if;

  return public.receipt_scan_normalize_plan(
    coalesce(
      v_subscription_plan,
      v_profile ->> 'plan',
      case
        when lower(coalesce(v_profile ->> 'premium_plus', '')) in ('true', '1', 'yes') then 'premium_plus'
        when lower(coalesce(v_profile ->> 'premium', '')) in ('true', '1', 'yes') then 'premium'
        when lower(coalesce(v_profile ->> 'is_premium', '')) in ('true', '1', 'yes') then 'premium'
        else null
      end,
      v_existing_plan,
      'free'
    )
  );
end;
$$;

create or replace function public.reserve_receipt_scan(
  p_request_id uuid,
  p_scan_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_key text := public.receipt_scan_month_key();
  v_plan text;
  v_limit integer;
  v_usage public.scan_usage%rowtype;
  v_request public.receipt_scan_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_scan_type not in ('single', 'long_receipt') then
    raise exception 'invalid_scan_type' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 240718));

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
      'limit', public.receipt_scan_plan_limit(v_request.plan),
      'remaining', greatest(public.receipt_scan_plan_limit(v_request.plan) - coalesce(v_usage.ai_scan_count, 0), 0)
    );
  end if;

  v_plan := public.receipt_scan_resolve_plan(v_user_id);
  v_limit := public.receipt_scan_plan_limit(v_plan);

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

  if coalesce(v_usage.ai_scan_count, 0) >= v_limit then
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
$$;

create or replace function public.complete_receipt_scan(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.receipt_scan_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  update public.receipt_scan_requests
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_reservation_id
    and user_id = v_user_id
    and status in ('reserved', 'completed')
  returning * into v_request;

  if not found then
    raise exception 'receipt_scan_reservation_not_found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_request.id,
    'status', v_request.status
  );
end;
$$;

create or replace function public.release_receipt_scan(
  p_reservation_id uuid,
  p_reason text default 'technical_failure'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.receipt_scan_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 240718));

  select * into v_request
  from public.receipt_scan_requests
  where id = p_reservation_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'receipt_scan_reservation_not_found' using errcode = '22023';
  end if;

  if v_request.status = 'reserved' and v_request.quota_counted then
    update public.scan_usage
    set scan_count = greatest(scan_count - 1, 0),
        ai_scan_count = greatest(ai_scan_count - 1, 0),
        updated_at = now()
    where user_id = v_user_id
      and month_key = v_request.month_key;
  end if;

  update public.receipt_scan_requests
  set status = 'released',
      quota_counted = false,
      released_at = now(),
      release_reason = left(coalesce(p_reason, 'technical_failure'), 120),
      updated_at = now()
  where id = p_reservation_id
    and user_id = v_user_id
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_request.id,
    'status', v_request.status
  );
end;
$$;

create or replace function public.increment_scan_usage(
  p_kind text default 'ai'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_key text := public.receipt_scan_month_key();
  v_plan text;
  v_limit integer;
  v_usage public.scan_usage%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_kind not in ('ai', 'manual') then
    raise exception 'invalid_scan_usage_kind' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 240719));

  v_plan := public.receipt_scan_resolve_plan(v_user_id);
  v_limit := public.receipt_scan_plan_limit(v_plan);

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

  if p_kind = 'ai' and coalesce(v_usage.ai_scan_count, 0) >= v_limit then
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
$$;

revoke insert, update, delete on public.scan_usage from authenticated;
grant select on public.scan_usage to authenticated;
grant select on public.receipt_scan_requests to authenticated;

revoke execute on function public.reserve_receipt_scan(uuid, text) from public;
revoke execute on function public.complete_receipt_scan(uuid) from public;
revoke execute on function public.release_receipt_scan(uuid, text) from public;
revoke execute on function public.increment_scan_usage(text) from public;

grant execute on function public.reserve_receipt_scan(uuid, text) to authenticated;
grant execute on function public.complete_receipt_scan(uuid) to authenticated;
grant execute on function public.release_receipt_scan(uuid, text) to authenticated;
grant execute on function public.increment_scan_usage(text) to authenticated;
