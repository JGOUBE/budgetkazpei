create extension if not exists pgcrypto;
create extension if not exists unaccent;

do $$
begin
  if to_regprocedure('public.market_normalize_text(text)') is null then
    execute $fn$
      create function public.market_normalize_text(value text)
      returns text
      language sql
      immutable
      set search_path = public
      as $body$
        select trim(
          regexp_replace(
            regexp_replace(
              lower(public.unaccent(coalesce(value, ''))),
              '[^a-z0-9]+',
              ' ',
              'g'
            ),
            '\s+',
            ' ',
            'g'
          )
        )
      $body$
    $fn$;
  end if;
end $$;

create table if not exists public.market_stores (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  normalized_store_name text not null,
  city text null,
  normalized_city text not null default '',
  island_region text not null default 'La Réunion',
  store_type text null,
  store_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.market_products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  brand text null,
  normalized_brand text not null default '',
  category text not null,
  subcategory text null,
  unit_type text null,
  package_size_value numeric null,
  package_size_unit text null,
  package_count integer null,
  package_format text null,
  barcode text null,
  product_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.market_product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  raw_label text not null,
  normalized_raw_label text not null,
  source text not null,
  confidence numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.market_seed_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  source text not null,
  store_id uuid not null,
  observed_date date not null,
  notes text null,
  created_at timestamptz not null default now(),
  receipt_total_before_discount numeric null,
  receipt_unallocated_discount numeric null,
  receipt_total_paid numeric null
);

create table if not exists public.market_price_observations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  observed_date date not null,
  price numeric not null,
  quantity numeric not null default 1,
  unit_price numeric null,
  unit_type text null,
  is_promotion boolean not null default false,
  promotion_label text null,
  confidence numeric not null,
  source text not null,
  batch_id uuid null,
  created_at timestamptz not null default now(),
  price_before_discount numeric null,
  discount_amount numeric null
);

create unique index if not exists market_products_barcode_uk
  on public.market_products (barcode)
  where barcode is not null;

create unique index if not exists market_product_aliases_product_label_source_uk
  on public.market_product_aliases (product_id, normalized_raw_label, source);

create index if not exists market_product_aliases_normalized_raw_label_idx
  on public.market_product_aliases (normalized_raw_label);

create index if not exists market_products_normalized_name_idx
  on public.market_products (normalized_name);

create index if not exists market_stores_normalized_store_city_idx
  on public.market_stores (normalized_store_name, normalized_city);

create index if not exists market_price_observations_batch_id_idx
  on public.market_price_observations (batch_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_product_aliases_product_id_fkey'
      and conrelid = 'public.market_product_aliases'::regclass
  ) then
    alter table public.market_product_aliases
      add constraint market_product_aliases_product_id_fkey
      foreign key (product_id) references public.market_products(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_seed_batches_store_id_fkey'
      and conrelid = 'public.market_seed_batches'::regclass
  ) then
    alter table public.market_seed_batches
      add constraint market_seed_batches_store_id_fkey
      foreign key (store_id) references public.market_stores(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_store_id_fkey'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_store_id_fkey
      foreign key (store_id) references public.market_stores(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_product_id_fkey'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_product_id_fkey
      foreign key (product_id) references public.market_products(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_batch_id_fkey'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_batch_id_fkey
      foreign key (batch_id) references public.market_seed_batches(id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_product_aliases_confidence_valid'
      and conrelid = 'public.market_product_aliases'::regclass
  ) then
    alter table public.market_product_aliases
      add constraint market_product_aliases_confidence_valid
      check (confidence >= 0 and confidence <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_price_positive'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_price_positive
      check (price > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_quantity_positive'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_quantity_positive
      check (quantity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_confidence_valid'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_confidence_valid
      check (confidence >= 0 and confidence <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_source_valid'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_source_valid
      check (source in ('manual_seed', 'receipt_scan_anonymized'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_unit_coherent'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_unit_coherent
      check (
        (unit_price is null and unit_type is null)
        or (unit_price is not null and unit_price > 0 and unit_type is not null and length(trim(unit_type)) > 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_discount_coherent'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_discount_coherent
      check (
        discount_amount is null
        or (
          discount_amount >= 0
          and price_before_discount is not null
          and price_before_discount >= price
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_price_observations_promotion_coherent'
      and conrelid = 'public.market_price_observations'::regclass
  ) then
    alter table public.market_price_observations
      add constraint market_price_observations_promotion_coherent
      check (
        is_promotion = true
        or (promotion_label is null and discount_amount is null and price_before_discount is null)
      );
  end if;
end $$;

alter table public.market_stores enable row level security;
alter table public.market_products enable row level security;
alter table public.market_product_aliases enable row level security;
alter table public.market_seed_batches enable row level security;
alter table public.market_price_observations enable row level security;

revoke all on table public.market_stores from public, anon, authenticated;
revoke all on table public.market_products from public, anon, authenticated;
revoke all on table public.market_product_aliases from public, anon, authenticated;
revoke all on table public.market_seed_batches from public, anon, authenticated;
revoke all on table public.market_price_observations from public, anon, authenticated;

grant all on table public.market_stores to postgres, service_role;
grant all on table public.market_products to postgres, service_role;
grant all on table public.market_product_aliases to postgres, service_role;
grant all on table public.market_seed_batches to postgres, service_role;
grant all on table public.market_price_observations to postgres, service_role;
