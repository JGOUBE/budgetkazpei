-- Extend the existing temporary shopping-list history with an explicit manual
-- save action. Existing share/copy snapshots remain fully compatible.

alter table public.shopping_list_snapshots
  drop constraint if exists shopping_list_snapshots_share_method_check;

alter table public.shopping_list_snapshots
  add constraint shopping_list_snapshots_share_method_check
  check (share_method in ('manual_save', 'native_share', 'whatsapp', 'sms', 'email', 'copy'));

create or replace function public.set_shopping_list_snapshot_retention()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- The database is authoritative for both timestamps. A client cannot extend
  -- the seven-day retention window by choosing its own expires_at value.
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.expires_at := new.created_at + interval '7 days';
  else
    new.created_at := old.created_at;
    new.expires_at := old.expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_list_snapshot_retention_before_insert
  on public.shopping_list_snapshots;

create trigger shopping_list_snapshot_retention_before_insert
before insert or update of created_at, expires_at on public.shopping_list_snapshots
for each row execute function public.set_shopping_list_snapshot_retention();

-- Expired/deleted snapshots are not readable through the API even in the
-- interval between their exact deadline and the next physical purge.
drop policy if exists "shopping_list_snapshots_select_own"
  on public.shopping_list_snapshots;

create policy "shopping_list_snapshots_select_own"
  on public.shopping_list_snapshots
  for select
  using (
    auth.uid() = user_id
    and status = 'active'
    and expires_at > now()
  );

create or replace function public.purge_expired_shopping_list_snapshots(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  delete from public.shopping_list_snapshots
  where expires_at <= p_now;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

alter function public.set_shopping_list_snapshot_retention() owner to postgres;
alter function public.purge_expired_shopping_list_snapshots(timestamptz) owner to postgres;

revoke all on function public.set_shopping_list_snapshot_retention() from public, anon, authenticated;
revoke all on function public.purge_expired_shopping_list_snapshots(timestamptz) from public, anon, authenticated;

grant select, insert, update, delete on public.shopping_list_snapshots to authenticated;

-- The project already uses pg_cron for retention work. This database-only
-- cleanup needs no Edge Function or secret, so it can be scheduled directly.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'shopping-list-snapshots-retention-hourly';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'shopping-list-snapshots-retention-hourly',
    '17 * * * *',
    'select public.purge_expired_shopping_list_snapshots();'
  );
end;
$$;
