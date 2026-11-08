-- A saved list expires seven days after its last actual content modification.
-- Opening or re-saving an unchanged list does not extend its lifetime.
alter table public.shopping_list_snapshots
  add column if not exists updated_at timestamptz;

update public.shopping_list_snapshots
set updated_at = created_at
where updated_at is null;

alter table public.shopping_list_snapshots
  alter column updated_at set default now();

create or replace function public.set_shopping_list_snapshot_retention()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := new.created_at;
    new.expires_at := new.created_at + interval '7 days';
  else
    new.created_at := old.created_at;
    if new.items is distinct from old.items
       or new.title is distinct from old.title
       or new.total_estimated is distinct from old.total_estimated
       or new.missing_price_count is distinct from old.missing_price_count
       or new.total_items is distinct from old.total_items then
      new.updated_at := now();
      new.expires_at := new.updated_at + interval '7 days';
    else
      new.updated_at := old.updated_at;
      new.expires_at := old.expires_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_list_snapshot_retention_before_insert
on public.shopping_list_snapshots;

create trigger shopping_list_snapshot_retention_before_insert
before insert or update on public.shopping_list_snapshots
for each row execute function public.set_shopping_list_snapshot_retention();
