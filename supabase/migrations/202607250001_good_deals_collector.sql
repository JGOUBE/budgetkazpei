begin;

do $$
declare
  required_table text;
  required_tables text[] := array[
    'public.good_deals',
    'public.good_deal_businesses',
    'public.shopping_catalogs',
    'public.shopping_products',
    'public.shopping_product_aliases',
    'public.shopping_promotions',
    'public.shopping_store_locations'
  ];
  invalid_id_tables text[];
begin
  foreach required_table in array required_tables loop
    if to_regclass(required_table) is null then
      raise exception 'Migration 202607250001_good_deals_collector requires table % to exist before execution.', required_table;
    end if;
  end loop;

  select array_agg(format('%I.%I', table_schema, table_name) order by table_name)
  into invalid_id_tables
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'good_deals',
      'good_deal_businesses',
      'shopping_catalogs',
      'shopping_products',
      'shopping_promotions',
      'shopping_store_locations'
    )
    and column_name = 'id'
    and udt_name <> 'uuid';

  if invalid_id_tables is not null then
    raise exception 'Migration 202607250001_good_deals_collector expects UUID ids for collector foreign keys. Invalid tables: %', array_to_string(invalid_id_tables, ', ');
  end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto;
create extension if not exists unaccent with schema extensions;

create or replace function public.good_deals_normalize_text(value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(unaccent(coalesce(value, ''))),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

create table if not exists public.good_deal_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  content_family text not null,
  source_type text not null,
  retailer_slug text null,
  organizer_name text null,
  source_url text not null,
  official_domain text not null,
  commune text null,
  micro_region text null,
  scope_type text not null,
  parser_key text not null,
  check_frequency text not null default 'twice_monthly',
  trust_level text not null default 'high',
  is_official boolean not null default true,
  is_active boolean not null default true,
  last_checked_at timestamptz null,
  last_changed_at timestamptz null,
  last_success_at timestamptz null,
  last_error_at timestamptz null,
  last_error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists good_deal_sources_slug_uk
  on public.good_deal_sources (slug);

create index if not exists good_deal_sources_source_url_idx
  on public.good_deal_sources (source_url);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_sources_content_family_valid'
      and conrelid = 'public.good_deal_sources'::regclass
  ) then
    alter table public.good_deal_sources
      add constraint good_deal_sources_content_family_valid
      check (content_family in ('shopping', 'event', 'permanent_leisure', 'mixed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_sources_source_type_valid'
      and conrelid = 'public.good_deal_sources'::regclass
  ) then
    alter table public.good_deal_sources
      add constraint good_deal_sources_source_type_valid
      check (source_type in ('html', 'pdf', 'image', 'feed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_sources_trust_level_valid'
      and conrelid = 'public.good_deal_sources'::regclass
  ) then
    alter table public.good_deal_sources
      add constraint good_deal_sources_trust_level_valid
      check (trust_level in ('high', 'medium', 'low'));
  end if;
end $$;

create table if not exists public.good_deal_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.good_deal_sources(id) on delete cascade,
  source_slug text not null,
  checked_at timestamptz not null default now(),
  http_status integer null,
  final_url text null,
  content_type text null,
  content_length bigint null,
  sha256 text null,
  etag text null,
  last_modified_header text null,
  changed boolean not null default true,
  processing_status text not null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists good_deal_source_snapshots_source_checked_idx
  on public.good_deal_source_snapshots (source_id, checked_at desc);

create index if not exists good_deal_source_snapshots_source_sha_checked_idx
  on public.good_deal_source_snapshots (source_id, sha256, checked_at desc)
  where sha256 is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_source_snapshots_processing_status_valid'
      and conrelid = 'public.good_deal_source_snapshots'::regclass
  ) then
    alter table public.good_deal_source_snapshots
      add constraint good_deal_source_snapshots_processing_status_valid
      check (processing_status in ('downloaded', 'skipped_unchanged', 'parsed', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_source_snapshots_content_length_valid'
      and conrelid = 'public.good_deal_source_snapshots'::regclass
  ) then
    alter table public.good_deal_source_snapshots
      add constraint good_deal_source_snapshots_content_length_valid
      check (content_length is null or content_length >= 0);
  end if;
end $$;

create table if not exists public.good_deal_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.good_deal_sources(id) on delete cascade,
  snapshot_id uuid null references public.good_deal_source_snapshots(id) on delete set null,
  external_key text not null,
  content_family text not null,
  content_kind text not null,
  title text not null,
  description text not null,
  business_name text null,
  retailer_slug text null,
  organizer_name text null,
  product_name text null,
  normalized_product_name text null,
  brand text null,
  size_label text null,
  category text null,
  tags text[] not null default '{}'::text[],
  promo_price numeric null,
  original_price numeric null,
  discount_percent numeric null,
  unit_price numeric null,
  unit_label text null,
  price_note text null,
  is_free boolean null,
  commune text null,
  micro_region text null,
  locality text null,
  territory_name text null,
  scope_type text not null,
  starts_at timestamptz null,
  ends_at timestamptz null,
  source_url text not null,
  source_page text null,
  source_excerpt text null,
  confidence_score integer not null default 0,
  confidence_reasons jsonb not null default '[]'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  duplicate_key text null,
  possible_duplicate_id uuid null references public.good_deal_candidates(id) on delete set null,
  status text not null default 'detected',
  published_good_deal_id uuid null references public.good_deals(id) on delete set null,
  detected_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  published_at timestamptz null,
  rejected_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists good_deal_candidates_source_external_uk
  on public.good_deal_candidates (source_id, external_key);

create index if not exists good_deal_candidates_status_idx
  on public.good_deal_candidates (status);

create index if not exists good_deal_candidates_content_family_idx
  on public.good_deal_candidates (content_family);

create index if not exists good_deal_candidates_source_idx
  on public.good_deal_candidates (source_id);

create index if not exists good_deal_candidates_duplicate_key_idx
  on public.good_deal_candidates (duplicate_key);

create index if not exists good_deal_candidates_normalized_product_idx
  on public.good_deal_candidates (normalized_product_name);

create index if not exists good_deal_candidates_detected_dates_idx
  on public.good_deal_candidates (detected_at desc, starts_at, ends_at);

create index if not exists good_deal_candidates_commune_idx
  on public.good_deal_candidates (commune);

create index if not exists good_deal_candidates_retailer_slug_idx
  on public.good_deal_candidates (retailer_slug);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_content_family_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_content_family_valid
      check (content_family in ('shopping', 'event', 'permanent_leisure', 'mixed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_content_kind_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_content_kind_valid
      check (content_kind in ('promotion', 'event', 'permanent_leisure', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_scope_type_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_scope_type_valid
      check (scope_type in ('local', 'commune', 'nearby', 'micro_region', 'island', 'online'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_status_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_status_valid
      check (status in ('detected', 'needs_review', 'approved', 'published', 'rejected', 'duplicate', 'expired'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_confidence_score_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_confidence_score_valid
      check (confidence_score >= 0 and confidence_score <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_promo_price_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_promo_price_valid
      check (promo_price is null or promo_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_original_price_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_original_price_valid
      check (original_price is null or original_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_unit_price_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_unit_price_valid
      check (unit_price is null or unit_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_discount_percent_valid'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_discount_percent_valid
      check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_candidates_dates_coherent'
      and conrelid = 'public.good_deal_candidates'::regclass
  ) then
    alter table public.good_deal_candidates
      add constraint good_deal_candidates_dates_coherent
      check (starts_at is null or ends_at is null or ends_at >= starts_at);
  end if;
end $$;

create table if not exists public.good_deal_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null,
  trigger_type text not null,
  mode text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running',
  sources_total integer not null default 0,
  sources_checked integer not null default 0,
  sources_changed integer not null default 0,
  documents_processed integer not null default 0,
  candidates_detected integer not null default 0,
  candidates_published integer not null default 0,
  candidates_needing_review integer not null default 0,
  duplicates_detected integer not null default 0,
  rejected_count integer not null default 0,
  expired_count integer not null default 0,
  errors_count integer not null default 0,
  error_summary jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists good_deal_ingestion_runs_run_key_uk
  on public.good_deal_ingestion_runs (run_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'good_deal_ingestion_runs_status_valid'
      and conrelid = 'public.good_deal_ingestion_runs'::regclass
  ) then
    alter table public.good_deal_ingestion_runs
      add constraint good_deal_ingestion_runs_status_valid
      check (status in ('running', 'completed', 'completed_with_errors', 'failed'));
  end if;
end $$;

alter table public.shopping_catalogs
  add column if not exists external_key text,
  add column if not exists collector_source_slug text;

alter table public.shopping_promotions
  add column if not exists external_key text,
  add column if not exists collector_source_slug text;

alter table public.good_deals
  add column if not exists external_key text,
  add column if not exists collector_source_slug text,
  add column if not exists collector_candidate_external_key text,
  add column if not exists source_still_available boolean default true,
  add column if not exists next_check_at timestamptz null;

create unique index if not exists shopping_catalogs_source_external_uk
  on public.shopping_catalogs (collector_source_slug, external_key)
  where collector_source_slug is not null
    and external_key is not null;

create unique index if not exists shopping_promotions_source_external_uk
  on public.shopping_promotions (collector_source_slug, external_key)
  where collector_source_slug is not null
    and external_key is not null;

create unique index if not exists good_deals_source_external_uk
  on public.good_deals (collector_source_slug, external_key)
  where collector_source_slug is not null
    and external_key is not null;

create or replace view public.good_deal_candidates_review
with (security_invoker = true)
as
select
  c.id,
  s.slug as source_slug,
  s.name as source_name,
  s.official_domain,
  c.title,
  c.content_family,
  c.content_kind,
  c.commune,
  c.scope_type,
  c.starts_at,
  c.ends_at,
  c.promo_price,
  c.original_price,
  c.discount_percent,
  c.confidence_score,
  c.confidence_reasons,
  c.validation_errors,
  c.status,
  c.source_url,
  c.source_page,
  c.source_excerpt,
  c.detected_at,
  c.published_good_deal_id
from public.good_deal_candidates c
join public.good_deal_sources s on s.id = c.source_id;

alter table public.good_deal_sources enable row level security;
alter table public.good_deal_source_snapshots enable row level security;
alter table public.good_deal_candidates enable row level security;
alter table public.good_deal_ingestion_runs enable row level security;

revoke all on table public.good_deal_sources from public, anon, authenticated;
revoke all on table public.good_deal_source_snapshots from public, anon, authenticated;
revoke all on table public.good_deal_candidates from public, anon, authenticated;
revoke all on table public.good_deal_ingestion_runs from public, anon, authenticated;
revoke all on public.good_deal_candidates_review from public, anon, authenticated;

grant all on table public.good_deal_sources to postgres, service_role;
grant all on table public.good_deal_source_snapshots to postgres, service_role;
grant all on table public.good_deal_candidates to postgres, service_role;
grant all on table public.good_deal_ingestion_runs to postgres, service_role;
grant select on public.good_deal_candidates_review to postgres, service_role;

insert into public.good_deal_sources (
  name,
  slug,
  content_family,
  source_type,
  retailer_slug,
  organizer_name,
  source_url,
  official_domain,
  commune,
  micro_region,
  scope_type,
  parser_key,
  check_frequency,
  trust_level,
  is_official,
  is_active
)
values
  ('Carrefour Reunion catalogues', 'carrefour-reunion-catalogues', 'shopping', 'html', 'carrefour-reunion', null, 'https://www.carrefour-reunion.com/catalogues/carrefour', 'carrefour-reunion.com', null, null, 'island', 'carrefour_reunion', 'twice_monthly', 'high', true, true),
  ('Magasins U Reunion', 'magasins-u-reunion-home', 'shopping', 'html', 'magasins-u-reunion', null, 'https://www.magasins-u.re/', 'magasins-u.re', null, null, 'island', 'magasins_u_reunion', 'twice_monthly', 'high', true, true),
  ('Run Market Reunion', 'run-market-reunion-home', 'shopping', 'html', 'run-market-reunion', null, 'https://www.run-market.re/', 'run-market.re', null, null, 'island', 'run_market_reunion', 'twice_monthly', 'high', true, true),
  ('Auchan Saint-Louis catalogues', 'auchan-saint-louis-catalogues', 'shopping', 'html', 'auchan-saint-louis', null, 'https://www.auchansaintlouis.com/les-catalogues', 'auchansaintlouis.com', 'Saint-Louis', null, 'commune', 'auchan_saint_louis', 'twice_monthly', 'high', true, true),
  ('E.Leclerc Reunion catalogues', 'e-leclerc-reunion-catalogues', 'shopping', 'html', 'eleclerc-reunion', null, 'https://www.e-leclerc.re/index.php/page/catalogues-reunion', 'e-leclerc.re', null, null, 'island', 'pending', 'twice_monthly', 'high', true, false),
  ('Mairie Saint-Paul events', 'mairie-saint-paul-events', 'event', 'html', null, 'Ville de Saint-Paul', 'https://www.mairie-saintpaul.re/', 'mairie-saintpaul.re', 'Saint-Paul', null, 'commune', 'saint_paul_events', 'twice_monthly', 'high', true, true),
  ('Ville du Port family leisure', 'ville-port-permanent-leisure', 'permanent_leisure', 'html', null, 'Ville du Port', 'https://www.ville-port.re/horaires-douverture-de-la-piscine-et-des-jeux-deau/', 'ville-port.re', 'Le Port', null, 'commune', 'ville_port_permanent_leisure', 'monthly', 'high', true, true)
on conflict (slug) do update
set
  name = excluded.name,
  content_family = excluded.content_family,
  source_type = excluded.source_type,
  retailer_slug = excluded.retailer_slug,
  organizer_name = excluded.organizer_name,
  source_url = excluded.source_url,
  official_domain = excluded.official_domain,
  commune = excluded.commune,
  micro_region = excluded.micro_region,
  scope_type = excluded.scope_type,
  parser_key = excluded.parser_key,
  check_frequency = excluded.check_frequency,
  trust_level = excluded.trust_level,
  is_official = excluded.is_official,
  is_active = excluded.is_active,
  updated_at = now();

commit;
