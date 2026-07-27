begin;

do $$
declare
  v_definition text;
begin
  if to_regclass('public.shopping_catalogs') is null then
    raise exception 'Migration 202607270006_good_deals_catalog_collector_source_kind requires public.shopping_catalogs to exist before execution.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shopping_catalogs'
      and column_name = 'source_kind'
  ) then
    raise exception 'Migration 202607270006_good_deals_catalog_collector_source_kind requires public.shopping_catalogs.source_kind to exist before execution.';
  end if;

  select pg_get_constraintdef(oid)
  into v_definition
  from pg_constraint
  where conrelid = 'public.shopping_catalogs'::regclass
    and conname = 'shopping_catalogs_source_kind_check';

  if v_definition is null then
    raise exception 'Migration 202607270006_good_deals_catalog_collector_source_kind requires shopping_catalogs_source_kind_check to exist before execution.';
  end if;

  if v_definition <> 'CHECK ((source_kind = ANY (ARRAY[''official_catalog''::text, ''official_offer''::text, ''partner_feed''::text])))' then
    raise exception 'Migration 202607270006_good_deals_catalog_collector_source_kind expected shopping_catalogs_source_kind_check definition %, found %.',
      'CHECK ((source_kind = ANY (ARRAY[''official_catalog''::text, ''official_offer''::text, ''partner_feed''::text])))',
      v_definition;
  end if;
end $$;

alter table public.shopping_catalogs
  drop constraint shopping_catalogs_source_kind_check;

alter table public.shopping_catalogs
  add constraint shopping_catalogs_source_kind_check
  check (
    source_kind = any (
      array[
        'official_catalog'::text,
        'official_offer'::text,
        'partner_feed'::text,
        'collector'::text
      ]
    )
  ) not valid;

alter table public.shopping_catalogs
  validate constraint shopping_catalogs_source_kind_check;

commit;
