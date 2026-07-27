begin;

do $$
begin
  if to_regclass('public.shopping_catalogs') is null then
    raise exception 'public.shopping_catalogs does not exist';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shopping_catalogs'
      and column_name = 'source_kind'
  ) then
    raise exception 'public.shopping_catalogs.source_kind does not exist';
  end if;

  if exists (
    select 1
    from public.shopping_catalogs
    where source_kind not in (
      'official_catalog',
      'official_offer',
      'partner_feed',
      'collector'
    )
  ) then
    raise exception
      'shopping_catalogs contains an unsupported source_kind';
  end if;
end $$;

alter table public.shopping_catalogs
  drop constraint if exists shopping_catalogs_source_kind_check;

alter table public.shopping_catalogs
  add constraint shopping_catalogs_source_kind_check
  check (
    source_kind in (
      'official_catalog',
      'official_offer',
      'partner_feed',
      'collector'
    )
  )
  not valid;

alter table public.shopping_catalogs
  validate constraint shopping_catalogs_source_kind_check;

commit;
