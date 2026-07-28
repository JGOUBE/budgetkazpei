begin;

do $$
begin
  if to_regclass('public.shopping_catalogs') is null then
    raise exception 'Migration 202607280001_shopping_catalog_page_snapshots requires public.shopping_catalogs to exist before execution.';
  end if;
end $$;

create table if not exists public.shopping_catalog_page_snapshots (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.shopping_catalogs(id) on delete cascade,
  page_number integer not null,
  asset_url text not null,
  asset_sha256 text not null,
  asset_content_type text null,
  asset_size_bytes bigint null,
  source_last_modified text null,
  extraction_status text not null,
  extraction_version text null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  extracted_at timestamptz null,
  purge_after timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shopping_catalog_page_snapshots_catalog_page_uk
  on public.shopping_catalog_page_snapshots (catalog_id, page_number);

create index if not exists shopping_catalog_page_snapshots_catalog_sha_idx
  on public.shopping_catalog_page_snapshots (catalog_id, asset_sha256);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_catalog_page_snapshots_page_number_valid'
      and conrelid = 'public.shopping_catalog_page_snapshots'::regclass
  ) then
    alter table public.shopping_catalog_page_snapshots
      add constraint shopping_catalog_page_snapshots_page_number_valid
      check (page_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_catalog_page_snapshots_asset_size_valid'
      and conrelid = 'public.shopping_catalog_page_snapshots'::regclass
  ) then
    alter table public.shopping_catalog_page_snapshots
      add constraint shopping_catalog_page_snapshots_asset_size_valid
      check (asset_size_bytes is null or asset_size_bytes >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_catalog_page_snapshots_status_valid'
      and conrelid = 'public.shopping_catalog_page_snapshots'::regclass
  ) then
    alter table public.shopping_catalog_page_snapshots
      add constraint shopping_catalog_page_snapshots_status_valid
      check (
        extraction_status in (
          'discovered',
          'unchanged',
          'pending_extraction',
          'extracted',
          'failed',
          'purged'
        )
      );
  end if;
end $$;

alter table public.shopping_catalog_page_snapshots enable row level security;

revoke all on table public.shopping_catalog_page_snapshots from public, anon, authenticated;
grant all on table public.shopping_catalog_page_snapshots to postgres, service_role;

drop policy if exists shopping_catalog_page_snapshots_service_role_all on public.shopping_catalog_page_snapshots;
create policy shopping_catalog_page_snapshots_service_role_all
  on public.shopping_catalog_page_snapshots
  for all
  to service_role
  using (true)
  with check (true);

commit;
