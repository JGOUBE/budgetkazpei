-- Limit paid, off-topic advisor messages without exposing quota mutation to users.
-- Use La Reunion local calendar days. The reservation is atomic: concurrent
-- requests cannot both pass the last available daily/monthly token.
create table if not exists public.advisor_offtopic_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day_key date not null,
  day_count integer not null default 0 check (day_count >= 0),
  month_key date not null,
  month_count integer not null default 0 check (month_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.advisor_offtopic_usage enable row level security;
revoke all on public.advisor_offtopic_usage from public, anon, authenticated;
grant select, insert, update, delete on public.advisor_offtopic_usage to service_role;

create or replace function public.advisor_reserve_offtopic(
  p_user_id uuid,
  p_day_limit integer,
  p_month_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Indian/Reunion')::date;
  v_month date := date_trunc('month', now() at time zone 'Indian/Reunion')::date;
  v_day_count integer;
  v_month_count integer;
begin
  if p_user_id is null or p_day_limit < 1 or p_month_limit < 1
     or p_day_limit > 30 or p_month_limit > 150 then
    raise exception 'Invalid advisor off-topic quota arguments';
  end if;

  insert into public.advisor_offtopic_usage as usage
    (user_id, day_key, day_count, month_key, month_count, updated_at)
  values (p_user_id, v_day, 1, v_month, 1, now())
  on conflict (user_id) do update
  set day_key = excluded.day_key,
      day_count = case when usage.day_key = excluded.day_key then usage.day_count + 1 else 1 end,
      month_key = excluded.month_key,
      month_count = case when usage.month_key = excluded.month_key then usage.month_count + 1 else 1 end,
      updated_at = now()
  where (case when usage.day_key = excluded.day_key then usage.day_count else 0 end) < p_day_limit
    and (case when usage.month_key = excluded.month_key then usage.month_count else 0 end) < p_month_limit
  returning day_count, month_count into v_day_count, v_month_count;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'dayUsed', v_day_count, 'monthUsed', v_month_count,
      'dayLimit', p_day_limit, 'monthLimit', p_month_limit
    );
  end if;

  select case when day_key = v_day then day_count else 0 end,
         case when month_key = v_month then month_count else 0 end
    into v_day_count, v_month_count
    from public.advisor_offtopic_usage
   where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', false,
    'dayUsed', coalesce(v_day_count, 0),
    'monthUsed', coalesce(v_month_count, 0),
    'dayLimit', p_day_limit, 'monthLimit', p_month_limit
  );
end;
$$;

revoke all on function public.advisor_reserve_offtopic(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.advisor_reserve_offtopic(uuid, integer, integer)
  to service_role;
