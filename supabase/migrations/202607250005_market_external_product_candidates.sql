-- Staging d'enrichissement externe controle des alias produits.
-- Cette table reste anonymisee: aucune image de ticket, identifiant utilisateur,
-- numero de ticket, email ou nom personnel n'y est stocke.

create table if not exists public.market_external_product_candidates (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_name text not null,
  source_identifier text null,
  source_url text null,
  raw_label text not null,
  normalized_raw_label text not null,
  candidate_canonical_name text not null,
  normalized_candidate_name text not null,
  brand text null,
  category text null,
  package_format text null,
  barcode text null,
  observed_price numeric null,
  store_name text null,
  store_city text null,
  source_confidence numeric not null default 0,
  matching_evidence jsonb not null default '{}'::jsonb,
  status text not null default 'candidate',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  matched_product_id uuid null references public.market_products(id) on delete set null,
  match_level text null,
  promoted_alias_id uuid null references public.market_product_aliases(id) on delete set null,
  validation_notes text null
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_external_product_candidates_status_valid'
      and conrelid = 'public.market_external_product_candidates'::regclass
  ) then
    alter table public.market_external_product_candidates
      add constraint market_external_product_candidates_status_valid
      check (status in ('candidate', 'validated', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_external_product_candidates_confidence_valid'
      and conrelid = 'public.market_external_product_candidates'::regclass
  ) then
    alter table public.market_external_product_candidates
      add constraint market_external_product_candidates_confidence_valid
      check (source_confidence >= 0 and source_confidence <= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_external_product_candidates_match_level_valid'
      and conrelid = 'public.market_external_product_candidates'::regclass
  ) then
    alter table public.market_external_product_candidates
      add constraint market_external_product_candidates_match_level_valid
      check (
        match_level is null
        or match_level in ('exact_strong', 'strong_without_barcode', 'ambiguous', 'rejected')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_external_product_candidates_labels_not_blank'
      and conrelid = 'public.market_external_product_candidates'::regclass
  ) then
    alter table public.market_external_product_candidates
      add constraint market_external_product_candidates_labels_not_blank
      check (
        length(trim(raw_label)) > 0
        and length(trim(normalized_raw_label)) > 0
        and length(trim(candidate_canonical_name)) > 0
        and length(trim(normalized_candidate_name)) > 0
      );
  end if;
end $$;

drop index if exists public.market_external_product_candidates_dedupe_uk;

create unique index if not exists market_external_product_candidates_dedupe_uk
  on public.market_external_product_candidates (
    source_name,
    source_identifier,
    normalized_raw_label,
    normalized_candidate_name,
    barcode,
    store_name,
    store_city
  ) nulls not distinct;

create index if not exists market_external_product_candidates_status_idx
  on public.market_external_product_candidates (status, source_confidence desc, updated_at desc);

create index if not exists market_external_product_candidates_barcode_idx
  on public.market_external_product_candidates (barcode)
  where barcode is not null;

create index if not exists market_external_product_candidates_product_idx
  on public.market_external_product_candidates (matched_product_id, status, source_confidence desc)
  where matched_product_id is not null;

comment on table public.market_external_product_candidates is
  'Staging des candidats produits issus de sources externes structurees, avec provenance et validation explicite.';
comment on column public.market_external_product_candidates.source_type is
  'Type de source structuree: open_food_facts, open_prices, official_product_page.';
comment on column public.market_external_product_candidates.matching_evidence is
  'Indices justifiant le rapprochement, sans donnees personnelles ni image de ticket.';
comment on column public.market_external_product_candidates.match_level is
  'Resultat du scoring local: exact_strong, strong_without_barcode, ambiguous ou rejected.';
comment on column public.market_external_product_candidates.promoted_alias_id is
  'Alias actif cree dans market_product_aliases apres validation/promotion.';

alter table public.market_external_product_candidates enable row level security;
revoke all on table public.market_external_product_candidates from public, anon, authenticated;
grant all on table public.market_external_product_candidates to postgres, service_role;
