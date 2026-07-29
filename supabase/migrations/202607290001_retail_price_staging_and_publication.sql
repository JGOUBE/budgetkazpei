begin;

do $$
declare
  required_table text;
  required_tables text[] := array[
    'public.profiles',
    'public.market_products',
    'public.market_product_aliases',
    'public.market_manual_product_aliases',
    'public.shopping_products',
    'public.shopping_product_aliases',
    'public.shopping_catalogs',
    'public.shopping_promotions',
    'public.shopping_store_locations'
  ];
begin
  foreach required_table in array required_tables loop
    if to_regclass(required_table) is null then
      raise exception 'Migration 202607290001_retail_price_staging_and_publication requires table % to exist before execution.', required_table;
    end if;
  end loop;

  if to_regclass('auth.users') is null then
    raise exception 'Migration 202607290001_retail_price_staging_and_publication requires auth.users to exist before execution.';
  end if;

  if to_regprocedure('public.good_deals_is_admin()') is null then
    raise exception 'Migration 202607290001_retail_price_staging_and_publication requires public.good_deals_is_admin() to exist before execution.';
  end if;

  if to_regprocedure('public.market_normalize_text(text)') is null then
    raise exception 'Migration 202607290001_retail_price_staging_and_publication requires public.market_normalize_text(text) to exist before execution.';
  end if;

  if to_regprocedure('public.market_store_chain_key(text)') is null then
    raise exception 'Migration 202607290001_retail_price_staging_and_publication requires public.market_store_chain_key(text) to exist before execution.';
  end if;

  if to_regprocedure('public.market_resolve_products_with_learned_aliases(jsonb)') is null then
    raise exception 'Migration 202607290001_retail_price_staging_and_publication requires public.market_resolve_products_with_learned_aliases(jsonb) to exist before execution.';
  end if;

  if to_regprocedure('public.good_deals_normalize_text(text)') is null then
    raise exception 'Migration 202607290001_retail_price_staging_and_publication requires public.good_deals_normalize_text(text) to exist before execution.';
  end if;
end $$;

create table if not exists public.retail_price_candidates (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_run_id uuid not null,
  source_product_id text null,
  source_product_id_key text generated always as (coalesce(source_product_id, '')) stored,
  source_url text not null,
  source_observed_at timestamptz not null,
  retailer_slug text not null,
  retailer_name text not null,
  store_slug text not null,
  store_name text not null,
  store_city text null,
  channel text not null,
  source_category text null,
  source_subcategory text null,
  raw_product_name text not null,
  product_name text not null,
  normalized_product_name text not null,
  brand text null,
  package_format text null,
  quantity_value numeric null,
  quantity_unit text null,
  pack_count integer null,
  total_quantity_value numeric null,
  total_quantity_unit text null,
  barcode text null,
  image_url text null,
  product_url text null,
  current_price numeric not null,
  original_price numeric null,
  unit_price numeric null,
  unit_price_unit text null,
  currency text not null default 'EUR',
  price_type text not null,
  promotion_proven boolean not null default false,
  promotion_evidence jsonb null,
  promo_badge text null,
  discount_percent numeric null,
  loyalty_amount numeric null,
  loyalty_type text null,
  offer_mechanism text null,
  conditions text null,
  starts_at timestamptz null,
  ends_at timestamptz null,
  matched_market_product_id uuid null references public.market_products(id) on delete set null,
  matched_shopping_product_id uuid null references public.shopping_products(id) on delete set null,
  match_method text null,
  match_confidence numeric null,
  match_warnings jsonb not null default '[]'::jsonb,
  status text not null default 'imported',
  validation_errors jsonb not null default '[]'::jsonb,
  review_notes text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  published_price_observation_id uuid null,
  published_promotion_id uuid null references public.shopping_promotions(id) on delete set null,
  duplicate_key text not null,
  extraction_confidence numeric not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retail_price_observations (
  id uuid primary key default gen_random_uuid(),
  market_product_id uuid not null references public.market_products(id) on delete restrict,
  shopping_product_id uuid null references public.shopping_products(id) on delete set null,
  retailer_slug text not null,
  store_slug text not null,
  store_name text not null,
  store_city text null,
  source_type text not null,
  source_product_id text null,
  channel text not null,
  price numeric not null,
  unit_price numeric null,
  unit_price_unit text null,
  currency text not null default 'EUR',
  price_type text not null,
  promotion_proven boolean not null default false,
  original_price numeric null,
  offer_mechanism text null,
  observed_at timestamptz not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  source_url text not null,
  source_confidence numeric null,
  candidate_id uuid null references public.retail_price_candidates(id) on delete set null,
  promotion_id uuid null references public.shopping_promotions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_published_price_observation_id_fkey'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_published_price_observation_id_fkey
      foreign key (published_price_observation_id)
      references public.retail_price_observations(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists retail_price_candidates_run_identity_uk
  on public.retail_price_candidates (source_run_id, duplicate_key, source_product_id_key, price_type);

create index if not exists retail_price_candidates_status_idx
  on public.retail_price_candidates (status, source_observed_at desc, updated_at desc);

create index if not exists retail_price_candidates_run_idx
  on public.retail_price_candidates (source_run_id, retailer_slug, store_slug, source_observed_at desc);

create index if not exists retail_price_candidates_market_match_idx
  on public.retail_price_candidates (matched_market_product_id, status, match_confidence desc)
  where matched_market_product_id is not null;

create index if not exists retail_price_candidates_shopping_match_idx
  on public.retail_price_candidates (matched_shopping_product_id, status, match_confidence desc)
  where matched_shopping_product_id is not null;

create index if not exists retail_price_candidates_source_product_idx
  on public.retail_price_candidates (retailer_slug, store_slug, source_type, source_product_id, updated_at desc)
  where source_product_id is not null;

create index if not exists retail_price_candidates_duplicate_idx
  on public.retail_price_candidates (duplicate_key, source_run_id);

create index if not exists retail_price_observations_lookup_idx
  on public.retail_price_observations (
    market_product_id,
    store_slug,
    channel,
    price,
    observed_at desc
  );

create index if not exists retail_price_observations_store_observed_idx
  on public.retail_price_observations (retailer_slug, store_slug, observed_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_source_type_not_blank'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_source_type_not_blank
      check (length(trim(source_type)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_identity_not_blank'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_identity_not_blank
      check (
        length(trim(source_url)) > 0
        and length(trim(retailer_slug)) > 0
        and length(trim(retailer_name)) > 0
        and length(trim(store_slug)) > 0
        and length(trim(store_name)) > 0
        and length(trim(channel)) > 0
        and length(trim(raw_product_name)) > 0
        and length(trim(product_name)) > 0
        and length(trim(normalized_product_name)) > 0
        and length(trim(duplicate_key)) > 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_price_type_valid'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_price_type_valid
      check (price_type in ('observed_price', 'promotion', 'receipt_price'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_status_valid'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_status_valid
      check (status in ('imported', 'matched', 'needs_review', 'approved_price', 'approved_promotion', 'rejected', 'duplicate', 'published'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_currency_eur'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_currency_eur
      check (currency = 'EUR');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_prices_valid'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_prices_valid
      check (
        current_price > 0
        and (original_price is null or original_price > 0)
        and (unit_price is null or unit_price > 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_quantities_valid'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_quantities_valid
      check (
        (quantity_value is null or quantity_value > 0)
        and (pack_count is null or pack_count > 0)
        and (total_quantity_value is null or total_quantity_value > 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_promotion_coherent'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_promotion_coherent
      check (
        (
          promotion_proven = false
          and (
            price_type in ('observed_price', 'receipt_price')
            or (
              price_type = 'promotion'
              and promotion_evidence is null
            )
          )
        )
        or (
          promotion_proven = true
          and price_type = 'promotion'
          and promotion_evidence is not null
          and jsonb_typeof(promotion_evidence) = 'object'
          and current_price > 0
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_offer_mechanism_valid'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_offer_mechanism_valid
      check (
        offer_mechanism is null
        or offer_mechanism in ('direct_discount', 'loyalty_credit', 'multi_buy', 'bundle', 'coupon', 'receipt_discount')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_dates_coherent'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_dates_coherent
      check (starts_at is null or ends_at is null or ends_at >= starts_at);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_discount_valid'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_discount_valid
      check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_confidence_valid'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_confidence_valid
      check (
        extraction_confidence >= 0
        and extraction_confidence <= 100
        and (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1))
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_json_arrays'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_json_arrays
      check (
        jsonb_typeof(match_warnings) = 'array'
        and jsonb_typeof(validation_errors) = 'array'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_candidates_approved_promotion_requires_proof'
      and conrelid = 'public.retail_price_candidates'::regclass
  ) then
    alter table public.retail_price_candidates
      add constraint retail_price_candidates_approved_promotion_requires_proof
      check (status <> 'approved_promotion' or promotion_proven = true);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_observations_identity_not_blank'
      and conrelid = 'public.retail_price_observations'::regclass
  ) then
    alter table public.retail_price_observations
      add constraint retail_price_observations_identity_not_blank
      check (
        length(trim(retailer_slug)) > 0
        and length(trim(store_slug)) > 0
        and length(trim(store_name)) > 0
        and length(trim(source_type)) > 0
        and length(trim(channel)) > 0
        and length(trim(source_url)) > 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_observations_price_valid'
      and conrelid = 'public.retail_price_observations'::regclass
  ) then
    alter table public.retail_price_observations
      add constraint retail_price_observations_price_valid
      check (
        price > 0
        and (unit_price is null or unit_price > 0)
        and (original_price is null or original_price > 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_observations_currency_eur'
      and conrelid = 'public.retail_price_observations'::regclass
  ) then
    alter table public.retail_price_observations
      add constraint retail_price_observations_currency_eur
      check (currency = 'EUR');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_observations_price_type_valid'
      and conrelid = 'public.retail_price_observations'::regclass
  ) then
    alter table public.retail_price_observations
      add constraint retail_price_observations_price_type_valid
      check (price_type in ('observed_price', 'promotion', 'receipt_price'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_observations_promotion_coherent'
      and conrelid = 'public.retail_price_observations'::regclass
  ) then
    alter table public.retail_price_observations
      add constraint retail_price_observations_promotion_coherent
      check (
        (promotion_proven = false and price_type in ('observed_price', 'receipt_price'))
        or (promotion_proven = true and price_type = 'promotion')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_observations_offer_mechanism_valid'
      and conrelid = 'public.retail_price_observations'::regclass
  ) then
    alter table public.retail_price_observations
      add constraint retail_price_observations_offer_mechanism_valid
      check (
        offer_mechanism is null
        or offer_mechanism in ('direct_discount', 'loyalty_credit', 'multi_buy', 'bundle', 'coupon', 'receipt_discount')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'retail_price_observations_confidence_valid'
      and conrelid = 'public.retail_price_observations'::regclass
  ) then
    alter table public.retail_price_observations
      add constraint retail_price_observations_confidence_valid
      check (source_confidence is null or (source_confidence >= 0 and source_confidence <= 1));
  end if;
end $$;

create or replace function public.retail_price_candidates_apply_review_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean := public.good_deals_is_admin();
  v_match_changed boolean := false;
begin
  new.updated_at := now();
  new.review_notes := nullif(btrim(coalesce(new.review_notes, '')), '');
  new.match_warnings := coalesce(new.match_warnings, '[]'::jsonb);
  new.validation_errors := coalesce(new.validation_errors, '[]'::jsonb);

  if jsonb_typeof(new.match_warnings) <> 'array' then
    raise exception 'match_warnings must stay a JSON array' using errcode = '22000';
  end if;

  if jsonb_typeof(new.validation_errors) <> 'array' then
    raise exception 'validation_errors must stay a JSON array' using errcode = '22000';
  end if;

  v_match_changed := (
    new.matched_market_product_id is distinct from old.matched_market_product_id
    or new.matched_shopping_product_id is distinct from old.matched_shopping_product_id
    or new.match_method is distinct from old.match_method
    or new.match_confidence is distinct from old.match_confidence
  );

  if old.status = 'published' and v_match_changed then
    raise exception 'published retail candidates cannot change matching fields without an explicit procedure'
      using errcode = '42501';
  end if;

  if v_is_admin and (
    new.product_name is distinct from old.product_name
    or new.brand is distinct from old.brand
    or new.package_format is distinct from old.package_format
    or new.current_price is distinct from old.current_price
    or new.original_price is distinct from old.original_price
    or new.unit_price is distinct from old.unit_price
    or new.status is distinct from old.status
    or v_match_changed
    or new.review_notes is distinct from old.review_notes
  ) then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;

  if new.status = 'approved_promotion' and new.promotion_proven is not true then
    raise exception 'approved_promotion requires an explicit proven promotion' using errcode = '22000';
  end if;

  if new.status = 'approved_price' and new.current_price <= 0 then
    raise exception 'approved_price requires a strictly positive current_price' using errcode = '22000';
  end if;

  return new;
end;
$$;

alter function public.retail_price_candidates_apply_review_audit() owner to postgres;
revoke all on function public.retail_price_candidates_apply_review_audit() from public, anon, authenticated;
grant execute on function public.retail_price_candidates_apply_review_audit() to postgres, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'retail_price_candidates_apply_review_audit_trg'
      and tgrelid = 'public.retail_price_candidates'::regclass
  ) then
    create trigger retail_price_candidates_apply_review_audit_trg
    before update on public.retail_price_candidates
    for each row
    execute function public.retail_price_candidates_apply_review_audit();
  end if;
end $$;

create or replace function public.retail_upsert_price_observation(
  p_candidate_id uuid,
  p_market_product_id uuid,
  p_shopping_product_id uuid default null,
  p_promotion_id uuid default null
)
returns table (
  observation_id uuid,
  action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
begin
  select *
  into v_candidate
  from public.retail_price_candidates
  where id = p_candidate_id;

  if not found then
    raise exception 'retail price candidate not found: %', p_candidate_id using errcode = 'P0002';
  end if;

  return query
  with existing as (
    select id
    from public.retail_price_observations
    where market_product_id = p_market_product_id
      and retailer_slug = v_candidate.retailer_slug
      and store_slug = v_candidate.store_slug
      and channel = v_candidate.channel
      and price = v_candidate.current_price
      and coalesce(unit_price, -1) = coalesce(v_candidate.unit_price, -1)
      and coalesce(unit_price_unit, '') = coalesce(v_candidate.unit_price_unit, '')
      and currency = v_candidate.currency
      and price_type = v_candidate.price_type
      and promotion_proven = v_candidate.promotion_proven
      and coalesce(original_price, -1) = coalesce(v_candidate.original_price, -1)
      and coalesce(offer_mechanism, '') = coalesce(v_candidate.offer_mechanism, '')
    order by last_seen_at desc
    limit 1
    for update
  ),
  updated as (
    update public.retail_price_observations
    set
      shopping_product_id = coalesce(p_shopping_product_id, shopping_product_id),
      promotion_id = coalesce(p_promotion_id, promotion_id),
      observed_at = greatest(observed_at, v_candidate.source_observed_at),
      last_seen_at = greatest(last_seen_at, v_candidate.source_observed_at),
      source_url = v_candidate.source_url,
      source_confidence = least(greatest(coalesce(v_candidate.match_confidence, 0), 0), 1),
      updated_at = now()
    where id in (select id from existing)
    returning id
  ),
  inserted as (
    insert into public.retail_price_observations (
      market_product_id,
      shopping_product_id,
      retailer_slug,
      store_slug,
      store_name,
      store_city,
      source_type,
      source_product_id,
      channel,
      price,
      unit_price,
      unit_price_unit,
      currency,
      price_type,
      promotion_proven,
      original_price,
      offer_mechanism,
      observed_at,
      first_seen_at,
      last_seen_at,
      source_url,
      source_confidence,
      candidate_id,
      promotion_id,
      created_at,
      updated_at
    )
    select
      p_market_product_id,
      p_shopping_product_id,
      v_candidate.retailer_slug,
      v_candidate.store_slug,
      v_candidate.store_name,
      v_candidate.store_city,
      v_candidate.source_type,
      v_candidate.source_product_id,
      v_candidate.channel,
      v_candidate.current_price,
      v_candidate.unit_price,
      v_candidate.unit_price_unit,
      v_candidate.currency,
      v_candidate.price_type,
      v_candidate.promotion_proven,
      v_candidate.original_price,
      v_candidate.offer_mechanism,
      v_candidate.source_observed_at,
      coalesce(v_candidate.first_seen_at, v_candidate.source_observed_at),
      greatest(v_candidate.last_seen_at, v_candidate.source_observed_at),
      v_candidate.source_url,
      least(greatest(coalesce(v_candidate.match_confidence, 0), 0), 1),
      v_candidate.id,
      p_promotion_id,
      now(),
      now()
    where not exists (select 1 from existing)
    returning id
  )
  select id, 'updated'::text from updated
  union all
  select id, 'created'::text from inserted;
end;
$$;

alter function public.retail_upsert_price_observation(uuid, uuid, uuid, uuid) owner to postgres;
revoke all on function public.retail_upsert_price_observation(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.retail_upsert_price_observation(uuid, uuid, uuid, uuid) to postgres, service_role;

create or replace function public.retail_create_reference_product_from_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_product_id uuid;
  v_product_key text;
begin
  if p_candidate_id is null then
    raise exception 'candidate id is required' using errcode = '22023';
  end if;

  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'retail reference product creation requires an administrator account' using errcode = '42501';
  end if;

  select *
  into v_candidate
  from public.retail_price_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'retail price candidate not found: %', p_candidate_id using errcode = 'P0002';
  end if;

  if v_candidate.matched_market_product_id is not null then
    return v_candidate.matched_market_product_id;
  end if;

  if nullif(btrim(coalesce(v_candidate.product_name, '')), '') is null then
    raise exception 'candidate product_name is required to create a market reference product' using errcode = '22000';
  end if;

  v_product_key := concat_ws(
    '|',
    coalesce(v_candidate.normalized_product_name, ''),
    public.market_normalize_text(coalesce(v_candidate.brand, '')),
    public.market_normalize_text(coalesce(v_candidate.source_category, 'retail')),
    coalesce(to_char(v_candidate.quantity_value, 'FM999999990.###'), ''),
    coalesce(v_candidate.quantity_unit, ''),
    coalesce(v_candidate.pack_count::text, ''),
    public.market_normalize_text(coalesce(v_candidate.package_format, ''))
  );

  select id
  into v_product_id
  from public.market_products
  where product_key = v_product_key
  limit 1;

  if v_product_id is null then
    insert into public.market_products (
      canonical_name,
      normalized_name,
      brand,
      normalized_brand,
      category,
      subcategory,
      unit_type,
      package_size_value,
      package_size_unit,
      package_count,
      package_format,
      barcode,
      product_key
    )
    values (
      v_candidate.product_name,
      v_candidate.normalized_product_name,
      v_candidate.brand,
      public.market_normalize_text(coalesce(v_candidate.brand, '')),
      coalesce(v_candidate.source_category, 'retail'),
      v_candidate.source_subcategory,
      v_candidate.total_quantity_unit,
      v_candidate.quantity_value,
      v_candidate.quantity_unit,
      v_candidate.pack_count,
      v_candidate.package_format,
      nullif(regexp_replace(coalesce(v_candidate.barcode, ''), '\D', '', 'g'), ''),
      v_product_key
    )
    returning id into v_product_id;
  end if;

  update public.retail_price_candidates
  set
    matched_market_product_id = v_product_id,
    match_method = 'admin_created_reference',
    match_confidence = 1,
    match_warnings = '[]'::jsonb,
    status = case when status = 'imported' then 'matched' else status end,
    updated_at = now()
  where id = v_candidate.id;

  return v_product_id;
end;
$$;

alter function public.retail_create_reference_product_from_candidate(uuid) owner to postgres;
revoke all on function public.retail_create_reference_product_from_candidate(uuid) from public, anon;
grant execute on function public.retail_create_reference_product_from_candidate(uuid) to authenticated, service_role, postgres;

create or replace function public.retail_resolve_or_create_shopping_product(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.retail_price_candidates%rowtype;
  v_product_id uuid;
  v_alias text;
begin
  select *
  into v_candidate
  from public.retail_price_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'retail price candidate not found: %', p_candidate_id using errcode = 'P0002';
  end if;

  if v_candidate.matched_shopping_product_id is not null then
    return v_candidate.matched_shopping_product_id;
  end if;

  select product_id
  into v_product_id
  from public.shopping_product_aliases
  where normalized_alias = public.good_deals_normalize_text(v_candidate.product_name)
    and retailer_slug is not distinct from v_candidate.retailer_slug
  limit 1;

  if v_product_id is null then
    select id
    into v_product_id
    from public.shopping_products
    where normalized_name is not distinct from v_candidate.normalized_product_name
      and brand is not distinct from v_candidate.brand
      and size_label is not distinct from v_candidate.package_format
    limit 1;
  end if;

  if v_product_id is null then
    insert into public.shopping_products (
      normalized_name,
      display_name,
      brand,
      size_label,
      category,
      is_active,
      updated_at
    )
    values (
      v_candidate.normalized_product_name,
      v_candidate.product_name,
      v_candidate.brand,
      v_candidate.package_format,
      coalesce(v_candidate.source_category, 'retail'),
      true,
      now()
    )
    returning id into v_product_id;
  end if;

  v_alias := nullif(public.good_deals_normalize_text(v_candidate.product_name), '');
  if v_alias is not null then
    perform 1
    from public.shopping_product_aliases
    where product_id = v_product_id
      and normalized_alias = v_alias
      and retailer_slug is not distinct from v_candidate.retailer_slug
    limit 1;

    if not found then
      insert into public.shopping_product_aliases (
        product_id,
        alias_text,
        normalized_alias,
        source_kind,
        retailer_slug,
        confidence_score
      )
      values (
        v_product_id,
        v_candidate.product_name,
        v_alias,
        'import',
        v_candidate.retailer_slug,
        least(greatest(coalesce(v_candidate.match_confidence, 0.75), 0), 1)
      );
    end if;
  end if;

  update public.retail_price_candidates
  set
    matched_shopping_product_id = v_product_id,
    updated_at = now()
  where id = v_candidate.id;

  return v_product_id;
end;
$$;

alter function public.retail_resolve_or_create_shopping_product(uuid) owner to postgres;
revoke all on function public.retail_resolve_or_create_shopping_product(uuid) from public, anon, authenticated;
grant execute on function public.retail_resolve_or_create_shopping_product(uuid) to postgres, service_role;

create or replace function public.retail_import_price_candidates(
  p_source_run_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_imported integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_duplicate integer := 0;
  v_rejected integer := 0;
  v_needs_review integer := 0;
begin
  if p_source_run_id is null then
    raise exception 'source_run_id is required' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a jsonb array' using errcode = '22023';
  end if;

  if not (session_user = 'postgres' or v_role = 'service_role') then
    raise exception 'retail import requires the service role' using errcode = '42501';
  end if;

  create temp table pg_temp.retail_import_items (
    ordinal integer primary key,
    source_type text not null,
    source_product_id text null,
    source_url text not null,
    source_observed_at timestamptz not null,
    retailer_slug text not null,
    retailer_name text not null,
    store_slug text not null,
    store_name text not null,
    store_city text null,
    channel text not null,
    source_category text null,
    source_subcategory text null,
    raw_product_name text not null,
    product_name text not null,
    normalized_product_name text not null,
    brand text null,
    package_format text null,
    quantity_value numeric null,
    quantity_unit text null,
    pack_count integer null,
    total_quantity_value numeric null,
    total_quantity_unit text null,
    barcode text null,
    image_url text null,
    product_url text null,
    current_price numeric null,
    original_price numeric null,
    unit_price numeric null,
    unit_price_unit text null,
    currency text not null,
    price_type text not null,
    promotion_proven boolean not null,
    promotion_evidence jsonb null,
    promo_badge text null,
    discount_percent numeric null,
    loyalty_amount numeric null,
    loyalty_type text null,
    offer_mechanism text null,
    conditions text null,
    starts_at timestamptz null,
    ends_at timestamptz null,
    duplicate_key text not null,
    extraction_confidence numeric not null,
    validation_errors jsonb not null default '[]'::jsonb,
    match_warnings jsonb not null default '[]'::jsonb,
    matched_market_product_id uuid null,
    matched_shopping_product_id uuid null,
    match_method text null,
    match_confidence numeric null,
    status text not null default 'imported'
  ) on commit drop;

  insert into pg_temp.retail_import_items (
    ordinal,
    source_type,
    source_product_id,
    source_url,
    source_observed_at,
    retailer_slug,
    retailer_name,
    store_slug,
    store_name,
    store_city,
    channel,
    source_category,
    source_subcategory,
    raw_product_name,
    product_name,
    normalized_product_name,
    brand,
    package_format,
    quantity_value,
    quantity_unit,
    pack_count,
    total_quantity_value,
    total_quantity_unit,
    barcode,
    image_url,
    product_url,
    current_price,
    original_price,
    unit_price,
    unit_price_unit,
    currency,
    price_type,
    promotion_proven,
    promotion_evidence,
    promo_badge,
    discount_percent,
    loyalty_amount,
    loyalty_type,
    offer_mechanism,
    conditions,
    starts_at,
    ends_at,
    duplicate_key,
    extraction_confidence,
    validation_errors,
    match_warnings
  )
  select
    entry.ordinality::integer,
    left(trim(coalesce(entry.item->>'source_type', '')), 80),
    nullif(left(trim(coalesce(entry.item->>'source_product_id', '')), 120), ''),
    left(trim(coalesce(entry.item->>'source_url', '')), 500),
    coalesce((entry.item->>'source_observed_at')::timestamptz, now()),
    left(trim(coalesce(entry.item->>'retailer_slug', '')), 120),
    left(trim(coalesce(entry.item->>'retailer_name', '')), 180),
    left(trim(coalesce(entry.item->>'store_slug', '')), 120),
    left(trim(coalesce(entry.item->>'store_name', '')), 180),
    nullif(left(trim(coalesce(entry.item->>'store_city', '')), 180), ''),
    left(trim(coalesce(entry.item->>'channel', '')), 80),
    nullif(left(trim(coalesce(entry.item->>'category', '')), 180), ''),
    nullif(left(trim(coalesce(entry.item->>'subcategory', '')), 180), ''),
    left(trim(coalesce(entry.item->>'raw_product_name', '')), 240),
    left(trim(coalesce(entry.item->>'product_name', entry.item->>'raw_product_name', '')), 240),
    public.market_normalize_text(coalesce(entry.item->>'product_name', entry.item->>'raw_product_name', '')),
    nullif(left(trim(coalesce(entry.item->>'brand', '')), 120), ''),
    nullif(left(trim(coalesce(entry.item->>'package_format', '')), 120), ''),
    case when coalesce(entry.item->>'quantity_value', '') ~ '^-?\d+(?:\.\d+)?$' then (entry.item->>'quantity_value')::numeric else null end,
    nullif(left(trim(coalesce(entry.item->>'quantity_unit', '')), 20), ''),
    case when coalesce(entry.item->>'pack_count', '') ~ '^-?\d+$' then (entry.item->>'pack_count')::integer else null end,
    case when coalesce(entry.item->>'total_quantity_value', '') ~ '^-?\d+(?:\.\d+)?$' then (entry.item->>'total_quantity_value')::numeric else null end,
    nullif(left(trim(coalesce(entry.item->>'total_quantity_unit', '')), 20), ''),
    nullif(regexp_replace(coalesce(entry.item->>'barcode', ''), '\D', '', 'g'), ''),
    nullif(left(trim(coalesce(entry.item->>'image_url', '')), 500), ''),
    nullif(left(trim(coalesce(entry.item->>'product_url', '')), 500), ''),
    case when coalesce(entry.item->>'current_price', '') ~ '^-?\d+(?:\.\d+)?$' then (entry.item->>'current_price')::numeric else null end,
    case when coalesce(entry.item->>'original_price', '') ~ '^-?\d+(?:\.\d+)?$' then (entry.item->>'original_price')::numeric else null end,
    case when coalesce(entry.item->>'unit_price', '') ~ '^-?\d+(?:\.\d+)?$' then (entry.item->>'unit_price')::numeric else null end,
    nullif(left(trim(coalesce(entry.item->>'unit_price_unit', '')), 20), ''),
    coalesce(nullif(left(trim(coalesce(entry.item->>'currency', '')), 8), ''), 'EUR'),
    left(trim(coalesce(entry.item->>'price_type', 'observed_price')), 40),
    coalesce((entry.item->>'promotion_proven')::boolean, false),
    case
      when jsonb_typeof(entry.item->'promotion_evidence') = 'object' then entry.item->'promotion_evidence'
      when nullif(trim(coalesce(entry.item->>'promotion_evidence', '')), '') is not null then jsonb_build_object('kind', trim(entry.item->>'promotion_evidence'))
      else null
    end,
    nullif(left(trim(coalesce(entry.item->>'promo_badge', '')), 120), ''),
    case when coalesce(entry.item->>'discount_percent', '') ~ '^-?\d+(?:\.\d+)?$' then (entry.item->>'discount_percent')::numeric else null end,
    case when coalesce(entry.item->>'loyalty_amount', '') ~ '^-?\d+(?:\.\d+)?$' then (entry.item->>'loyalty_amount')::numeric else null end,
    nullif(left(trim(coalesce(entry.item->>'loyalty_type', '')), 80), ''),
    nullif(left(trim(coalesce(entry.item->>'offer_mechanism', '')), 80), ''),
    nullif(left(trim(coalesce(entry.item->>'conditions', '')), 500), ''),
    case when coalesce(entry.item->>'starts_at', '') <> '' then (entry.item->>'starts_at')::timestamptz else null end,
    case when coalesce(entry.item->>'ends_at', '') <> '' then (entry.item->>'ends_at')::timestamptz else null end,
    case
      when nullif(trim(coalesce(entry.item->>'duplicate_key', '')), '') is not null then trim(entry.item->>'duplicate_key')
      when nullif(trim(coalesce(entry.item->>'product_url', '')), '') is not null then lower(trim(entry.item->>'store_slug')) || '|' || lower(trim(entry.item->>'product_url'))
      else lower(trim(entry.item->>'store_slug')) || '|' || public.market_normalize_text(coalesce(entry.item->>'product_name', entry.item->>'raw_product_name', '')) || '|' || public.market_normalize_text(coalesce(entry.item->>'brand', '')) || '|' || public.market_normalize_text(coalesce(entry.item->>'package_format', ''))
    end,
    least(greatest(coalesce((entry.item->>'extraction_confidence')::numeric, 0), 0), 100),
    coalesce(
      case when jsonb_typeof(entry.item->'validation_errors') = 'array' then entry.item->'validation_errors' else null end,
      '[]'::jsonb
    ),
    coalesce(
      case when jsonb_typeof(entry.item->'match_warnings') = 'array' then entry.item->'match_warnings' else null end,
      '[]'::jsonb
    )
  from jsonb_array_elements(p_items) with ordinality as entry(item, ordinality);

  update pg_temp.retail_import_items
  set validation_errors = validation_errors || jsonb_build_array('invalid_current_price')
  where current_price is null or current_price <= 0;

  update pg_temp.retail_import_items
  set validation_errors = validation_errors || jsonb_build_array('invalid_currency')
  where currency <> 'EUR';

  update pg_temp.retail_import_items
  set validation_errors = validation_errors || jsonb_build_array('promotion_without_explicit_proof')
  where price_type = 'promotion'
    and (promotion_proven is not true or promotion_evidence is null);

  update pg_temp.retail_import_items
  set validation_errors = validation_errors || jsonb_build_array('invalid_price_type')
  where price_type not in ('observed_price', 'promotion', 'receipt_price');

  with prior_source_product as (
    select distinct on (retailer_slug, store_slug, source_type, source_product_id)
      retailer_slug,
      store_slug,
      source_type,
      source_product_id,
      matched_market_product_id
    from public.retail_price_candidates
    where source_product_id is not null
      and matched_market_product_id is not null
      and status in ('matched', 'approved_price', 'approved_promotion', 'published')
    order by retailer_slug, store_slug, source_type, source_product_id, updated_at desc
  )
  update pg_temp.retail_import_items as items
  set
    matched_market_product_id = prior_source_product.matched_market_product_id,
    match_method = 'source_product_id_history',
    match_confidence = 0.99
  from prior_source_product
  where items.source_product_id is not null
    and items.retailer_slug = prior_source_product.retailer_slug
    and items.store_slug = prior_source_product.store_slug
    and items.source_type = prior_source_product.source_type
    and items.source_product_id = prior_source_product.source_product_id
    and items.matched_market_product_id is null;

  create temp table pg_temp.retail_resolver_payload on commit drop as
  select jsonb_build_object(
    'index', ordinal,
    'raw_name', product_name,
    'barcode', barcode,
    'observed_price', current_price,
    'store_name', store_name,
    'store_city', coalesce(store_city, ''),
    'observed_date', to_char(source_observed_at at time zone 'UTC', 'YYYY-MM-DD'),
    'brand', coalesce(brand, ''),
    'package_format', coalesce(package_format, ''),
    'alternate_names', '[]'::jsonb
  ) as payload
  from pg_temp.retail_import_items
  where matched_market_product_id is null
    and jsonb_array_length(validation_errors) = 0;

  create temp table pg_temp.retail_resolver_results on commit drop as
  select
    (value->>'index')::integer as ordinal,
    case when coalesce(value->>'market_matched', 'false') = 'true' then (value->>'market_product_id')::uuid else null end as matched_market_product_id,
    nullif(value->>'market_match_type', '') as match_method,
    case when coalesce(value->>'market_match_confidence', '') ~ '^-?\d+(?:\.\d+)?$' then (value->>'market_match_confidence')::numeric else null end as match_confidence,
    case when coalesce(value->>'market_suggested', 'false') = 'true' then true else false end as suggested,
    case when coalesce(value->>'market_suggestion_confidence', '') ~ '^-?\d+(?:\.\d+)?$' then (value->>'market_suggestion_confidence')::numeric else null end as suggestion_confidence,
    nullif(value->>'market_suggestion_reason', '') as suggestion_reason,
    nullif(value->>'market_suggestion_product_id', '')::uuid as suggestion_product_id
  from jsonb_array_elements(
    public.market_resolve_products_with_learned_aliases(
      coalesce((select jsonb_agg(payload) from pg_temp.retail_resolver_payload), '[]'::jsonb)
    )
  ) as value;

  update pg_temp.retail_import_items as items
  set
    matched_market_product_id = coalesce(results.matched_market_product_id, items.matched_market_product_id),
    match_method = coalesce(results.match_method, items.match_method),
    match_confidence = coalesce(results.match_confidence, items.match_confidence),
    match_warnings = case
      when results.suggested then match_warnings || jsonb_build_array(coalesce(results.suggestion_reason, 'market_suggestion'))
      else match_warnings
    end
  from pg_temp.retail_resolver_results as results
  where items.ordinal = results.ordinal;

  update pg_temp.retail_import_items as items
  set
    matched_market_product_id = null,
    match_method = coalesce(items.match_method, 'review_required'),
    match_confidence = null,
    match_warnings = match_warnings || jsonb_build_array('brand_mismatch_requires_review')
  from public.market_products as products
  where items.matched_market_product_id = products.id
    and nullif(public.market_normalize_text(coalesce(items.brand, '')), '') is not null
    and nullif(public.market_normalize_text(coalesce(products.brand, '')), '') is not null
    and public.market_normalize_text(coalesce(items.brand, '')) <> public.market_normalize_text(coalesce(products.brand, ''));

  update pg_temp.retail_import_items as items
  set
    matched_market_product_id = null,
    match_method = coalesce(items.match_method, 'review_required'),
    match_confidence = null,
    match_warnings = match_warnings || jsonb_build_array('package_format_mismatch_requires_review')
  from public.market_products as products
  where items.matched_market_product_id = products.id
    and nullif(public.market_normalize_text(coalesce(items.package_format, '')), '') is not null
    and nullif(public.market_normalize_text(coalesce(products.package_format, '')), '') is not null
    and public.market_normalize_text(coalesce(items.package_format, '')) <> public.market_normalize_text(coalesce(products.package_format, ''));

  update pg_temp.retail_import_items
  set status = 'duplicate'
  where jsonb_array_length(validation_errors) = 0
    and duplicate_key in (
      select duplicate_key
      from pg_temp.retail_import_items
      group by duplicate_key
      having count(*) > 1
    )
    and ordinal not in (
      select min(ordinal)
      from pg_temp.retail_import_items
      group by duplicate_key
    );

  update pg_temp.retail_import_items
  set status = 'rejected'
  where jsonb_array_length(validation_errors) > 0;

  update pg_temp.retail_import_items
  set status = 'matched'
  where status = 'imported'
    and matched_market_product_id is not null
    and jsonb_array_length(match_warnings) = 0;

  update pg_temp.retail_import_items
  set status = 'needs_review'
  where status = 'imported'
    and (
      matched_market_product_id is null
      or jsonb_array_length(match_warnings) > 0
    );

  update pg_temp.retail_import_items as items
  set matched_shopping_product_id = aliases.product_id
  from public.shopping_product_aliases as aliases
  where items.matched_shopping_product_id is null
    and aliases.normalized_alias = public.good_deals_normalize_text(items.product_name)
    and aliases.retailer_slug is not distinct from items.retailer_slug;

  create temp table pg_temp.retail_existing_candidates on commit drop as
  select
    items.ordinal,
    candidates.id,
    (
      candidates.reviewed_at is not null
      or candidates.status in ('approved_price', 'approved_promotion', 'rejected', 'published')
    ) as review_locked,
    (
      candidates.source_type is distinct from items.source_type
      or candidates.source_url is distinct from items.source_url
      or candidates.source_observed_at is distinct from items.source_observed_at
      or candidates.retailer_slug is distinct from items.retailer_slug
      or candidates.retailer_name is distinct from items.retailer_name
      or candidates.store_slug is distinct from items.store_slug
      or candidates.store_name is distinct from items.store_name
      or candidates.store_city is distinct from items.store_city
      or candidates.channel is distinct from items.channel
      or candidates.source_category is distinct from items.source_category
      or candidates.source_subcategory is distinct from items.source_subcategory
      or candidates.raw_product_name is distinct from items.raw_product_name
      or candidates.product_name is distinct from items.product_name
      or candidates.normalized_product_name is distinct from items.normalized_product_name
      or candidates.brand is distinct from items.brand
      or candidates.package_format is distinct from items.package_format
      or candidates.quantity_value is distinct from items.quantity_value
      or candidates.quantity_unit is distinct from items.quantity_unit
      or candidates.pack_count is distinct from items.pack_count
      or candidates.total_quantity_value is distinct from items.total_quantity_value
      or candidates.total_quantity_unit is distinct from items.total_quantity_unit
      or candidates.barcode is distinct from items.barcode
      or candidates.image_url is distinct from items.image_url
      or candidates.product_url is distinct from items.product_url
      or candidates.current_price is distinct from items.current_price
      or candidates.original_price is distinct from items.original_price
      or candidates.unit_price is distinct from items.unit_price
      or candidates.unit_price_unit is distinct from items.unit_price_unit
      or candidates.currency is distinct from items.currency
      or candidates.promotion_proven is distinct from items.promotion_proven
      or candidates.promotion_evidence is distinct from items.promotion_evidence
      or candidates.promo_badge is distinct from items.promo_badge
      or candidates.discount_percent is distinct from items.discount_percent
      or candidates.loyalty_amount is distinct from items.loyalty_amount
      or candidates.loyalty_type is distinct from items.loyalty_type
      or candidates.offer_mechanism is distinct from items.offer_mechanism
      or candidates.conditions is distinct from items.conditions
      or candidates.starts_at is distinct from items.starts_at
      or candidates.ends_at is distinct from items.ends_at
      or candidates.validation_errors is distinct from items.validation_errors
      or candidates.duplicate_key is distinct from items.duplicate_key
      or candidates.extraction_confidence is distinct from items.extraction_confidence
      or candidates.last_seen_at is distinct from greatest(candidates.last_seen_at, items.source_observed_at)
      or candidates.matched_market_product_id is distinct from (
        case
          when candidates.reviewed_at is not null
               or candidates.status in ('approved_price', 'approved_promotion', 'rejected', 'published')
            then candidates.matched_market_product_id
          else items.matched_market_product_id
        end
      )
      or candidates.matched_shopping_product_id is distinct from (
        case
          when candidates.reviewed_at is not null
               or candidates.status in ('approved_price', 'approved_promotion', 'rejected', 'published')
            then candidates.matched_shopping_product_id
          else items.matched_shopping_product_id
        end
      )
      or candidates.match_method is distinct from (
        case
          when candidates.reviewed_at is not null
               or candidates.status in ('approved_price', 'approved_promotion', 'rejected', 'published')
            then candidates.match_method
          else items.match_method
        end
      )
      or candidates.match_confidence is distinct from (
        case
          when candidates.reviewed_at is not null
               or candidates.status in ('approved_price', 'approved_promotion', 'rejected', 'published')
            then candidates.match_confidence
          else items.match_confidence
        end
      )
      or candidates.match_warnings is distinct from (
        case
          when candidates.reviewed_at is not null
               or candidates.status in ('approved_price', 'approved_promotion', 'rejected', 'published')
            then candidates.match_warnings
          else items.match_warnings
        end
      )
      or candidates.status is distinct from (
        case
          when candidates.reviewed_at is not null
               or candidates.status in ('approved_price', 'approved_promotion', 'rejected', 'published')
            then candidates.status
          else items.status
        end
      )
    ) as changed
  from pg_temp.retail_import_items as items
  join public.retail_price_candidates as candidates
    on candidates.source_run_id = p_source_run_id
   and candidates.duplicate_key = items.duplicate_key
   and candidates.source_product_id_key = coalesce(items.source_product_id, '')
   and candidates.price_type = items.price_type;

  update public.retail_price_candidates as candidates
  set
    source_type = items.source_type,
    source_url = items.source_url,
    source_observed_at = items.source_observed_at,
    retailer_slug = items.retailer_slug,
    retailer_name = items.retailer_name,
    store_slug = items.store_slug,
    store_name = items.store_name,
    store_city = items.store_city,
    channel = items.channel,
    source_category = items.source_category,
    source_subcategory = items.source_subcategory,
    raw_product_name = items.raw_product_name,
    product_name = items.product_name,
    normalized_product_name = items.normalized_product_name,
    brand = items.brand,
    package_format = items.package_format,
    quantity_value = items.quantity_value,
    quantity_unit = items.quantity_unit,
    pack_count = items.pack_count,
    total_quantity_value = items.total_quantity_value,
    total_quantity_unit = items.total_quantity_unit,
    barcode = items.barcode,
    image_url = items.image_url,
    product_url = items.product_url,
    current_price = items.current_price,
    original_price = items.original_price,
    unit_price = items.unit_price,
    unit_price_unit = items.unit_price_unit,
    currency = items.currency,
    promotion_proven = items.promotion_proven,
    promotion_evidence = items.promotion_evidence,
    promo_badge = items.promo_badge,
    discount_percent = items.discount_percent,
    loyalty_amount = items.loyalty_amount,
    loyalty_type = items.loyalty_type,
    offer_mechanism = items.offer_mechanism,
    conditions = items.conditions,
    starts_at = items.starts_at,
    ends_at = items.ends_at,
    matched_market_product_id = case
      when existing.review_locked then candidates.matched_market_product_id
      else items.matched_market_product_id
    end,
    matched_shopping_product_id = case
      when existing.review_locked then candidates.matched_shopping_product_id
      else items.matched_shopping_product_id
    end,
    match_method = case
      when existing.review_locked then candidates.match_method
      else items.match_method
    end,
    match_confidence = case
      when existing.review_locked then candidates.match_confidence
      else items.match_confidence
    end,
    match_warnings = case
      when existing.review_locked then candidates.match_warnings
      else items.match_warnings
    end,
    status = case
      when existing.review_locked then candidates.status
      else items.status
    end,
    validation_errors = items.validation_errors,
    duplicate_key = items.duplicate_key,
    extraction_confidence = items.extraction_confidence,
    last_seen_at = greatest(candidates.last_seen_at, items.source_observed_at),
    updated_at = now()
  from pg_temp.retail_import_items as items
  join pg_temp.retail_existing_candidates as existing
    on existing.ordinal = items.ordinal
  where candidates.id = existing.id
    and items.status <> 'duplicate'
    and items.current_price is not null
    and items.current_price > 0;

  insert into public.retail_price_candidates (
    source_type,
    source_run_id,
    source_product_id,
    source_url,
    source_observed_at,
    retailer_slug,
    retailer_name,
    store_slug,
    store_name,
    store_city,
    channel,
    source_category,
    source_subcategory,
    raw_product_name,
    product_name,
    normalized_product_name,
    brand,
    package_format,
    quantity_value,
    quantity_unit,
    pack_count,
    total_quantity_value,
    total_quantity_unit,
    barcode,
    image_url,
    product_url,
    current_price,
    original_price,
    unit_price,
    unit_price_unit,
    currency,
    price_type,
    promotion_proven,
    promotion_evidence,
    promo_badge,
    discount_percent,
    loyalty_amount,
    loyalty_type,
    offer_mechanism,
    conditions,
    starts_at,
    ends_at,
    matched_market_product_id,
    matched_shopping_product_id,
    match_method,
    match_confidence,
    match_warnings,
    status,
    validation_errors,
    duplicate_key,
    extraction_confidence,
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  select
    items.source_type,
    p_source_run_id,
    items.source_product_id,
    items.source_url,
    items.source_observed_at,
    items.retailer_slug,
    items.retailer_name,
    items.store_slug,
    items.store_name,
    items.store_city,
    items.channel,
    items.source_category,
    items.source_subcategory,
    items.raw_product_name,
    items.product_name,
    items.normalized_product_name,
    items.brand,
    items.package_format,
    items.quantity_value,
    items.quantity_unit,
    items.pack_count,
    items.total_quantity_value,
    items.total_quantity_unit,
    items.barcode,
    items.image_url,
    items.product_url,
    items.current_price,
    items.original_price,
    items.unit_price,
    items.unit_price_unit,
    items.currency,
    items.price_type,
    items.promotion_proven,
    items.promotion_evidence,
    items.promo_badge,
    items.discount_percent,
    items.loyalty_amount,
    items.loyalty_type,
    items.offer_mechanism,
    items.conditions,
    items.starts_at,
    items.ends_at,
    items.matched_market_product_id,
    items.matched_shopping_product_id,
    items.match_method,
    items.match_confidence,
    items.match_warnings,
    items.status,
    items.validation_errors,
    items.duplicate_key,
    items.extraction_confidence,
    items.source_observed_at,
    items.source_observed_at,
    now(),
    now()
  from pg_temp.retail_import_items as items
  where not exists (
    select 1
    from public.retail_price_candidates as candidates
    where candidates.source_run_id = p_source_run_id
      and candidates.duplicate_key = items.duplicate_key
      and candidates.source_product_id_key = coalesce(items.source_product_id, '')
      and candidates.price_type = items.price_type
  )
    and items.status <> 'duplicate'
    and items.current_price is not null
    and items.current_price > 0;

  select count(*)
  into v_imported
  from pg_temp.retail_import_items as items
  where not exists (
    select 1
    from pg_temp.retail_existing_candidates as existing_candidates
    where existing_candidates.ordinal = items.ordinal
  )
    and items.status <> 'duplicate'
    and items.current_price is not null
    and items.current_price > 0;

  select count(*)
  into v_updated
  from pg_temp.retail_existing_candidates as existing_candidates
  join pg_temp.retail_import_items as items
    on items.ordinal = existing_candidates.ordinal
  where existing_candidates.changed
    and items.status <> 'duplicate'
    and items.current_price is not null
    and items.current_price > 0;

  select count(*)
  into v_unchanged
  from pg_temp.retail_existing_candidates as existing_candidates
  join pg_temp.retail_import_items as items
    on items.ordinal = existing_candidates.ordinal
  where not existing_candidates.changed
    and items.status <> 'duplicate'
    and items.current_price is not null
    and items.current_price > 0;

  select count(*) into v_duplicate from pg_temp.retail_import_items where status = 'duplicate';
  select count(*) into v_rejected from pg_temp.retail_import_items where status = 'rejected';
  select count(*) into v_needs_review from pg_temp.retail_import_items where status = 'needs_review';

  return jsonb_build_object(
    'source_run_id', p_source_run_id,
    'imported', v_imported,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'duplicate', v_duplicate,
    'rejected', v_rejected,
    'needs_review', v_needs_review
  );
end;
$$;

alter function public.retail_import_price_candidates(uuid, jsonb) owner to postgres;
revoke all on function public.retail_import_price_candidates(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.retail_import_price_candidates(uuid, jsonb) to service_role, postgres;

create or replace function public.retail_publish_price_candidates(p_candidate_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_candidate_id uuid;
  v_candidate public.retail_price_candidates%rowtype;
  v_result record;
  v_created_ids uuid[] := '{}'::uuid[];
  v_updated_ids uuid[] := '{}'::uuid[];
  v_ignored_ids uuid[] := '{}'::uuid[];
  v_rejected_ids uuid[] := '{}'::uuid[];
begin
  if p_candidate_ids is null or array_length(p_candidate_ids, 1) is null then
    raise exception 'candidate ids are required' using errcode = '22023';
  end if;

  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'retail price publication requires an administrator account' using errcode = '42501';
  end if;

  foreach v_candidate_id in array p_candidate_ids loop
    select *
    into v_candidate
    from public.retail_price_candidates
    where id = v_candidate_id
    for update;

    if not found then
      v_rejected_ids := array_append(v_rejected_ids, v_candidate_id);
      continue;
    end if;

    if v_candidate.status = 'published' and v_candidate.published_price_observation_id is not null then
      v_ignored_ids := array_append(v_ignored_ids, v_candidate.id);
      continue;
    end if;

    if v_candidate.status <> 'approved_price' then
      v_rejected_ids := array_append(v_rejected_ids, v_candidate.id);
      continue;
    end if;

    if v_candidate.matched_market_product_id is null or v_candidate.current_price <= 0 then
      v_rejected_ids := array_append(v_rejected_ids, v_candidate.id);
      continue;
    end if;

    select *
    into v_result
    from public.retail_upsert_price_observation(v_candidate.id, v_candidate.matched_market_product_id, v_candidate.matched_shopping_product_id, null);

    if v_result.action = 'created' then
      v_created_ids := array_append(v_created_ids, v_result.observation_id);
    else
      v_updated_ids := array_append(v_updated_ids, v_result.observation_id);
    end if;

    update public.retail_price_candidates
    set
      status = 'published',
      published_price_observation_id = v_result.observation_id,
      last_seen_at = greatest(last_seen_at, source_observed_at),
      updated_at = now()
    where id = v_candidate.id;
  end loop;

  return jsonb_build_object(
    'created', to_jsonb(coalesce(v_created_ids, '{}'::uuid[])),
    'updated', to_jsonb(coalesce(v_updated_ids, '{}'::uuid[])),
    'ignored', to_jsonb(coalesce(v_ignored_ids, '{}'::uuid[])),
    'rejected', to_jsonb(coalesce(v_rejected_ids, '{}'::uuid[]))
  );
end;
$$;

alter function public.retail_publish_price_candidates(uuid[]) owner to postgres;
revoke all on function public.retail_publish_price_candidates(uuid[]) from public, anon;
grant execute on function public.retail_publish_price_candidates(uuid[]) to authenticated, service_role, postgres;

create or replace function public.retail_publish_promotion_candidates(p_candidate_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_candidate_id uuid;
  v_candidate public.retail_price_candidates%rowtype;
  v_result record;
  v_store_location_id uuid;
  v_catalog_id uuid;
  v_shopping_product_id uuid;
  v_promotion_id uuid;
  v_observed_at_day text;
  v_created_ids uuid[] := '{}'::uuid[];
  v_updated_ids uuid[] := '{}'::uuid[];
  v_ignored_ids uuid[] := '{}'::uuid[];
  v_rejected_ids uuid[] := '{}'::uuid[];
begin
  if p_candidate_ids is null or array_length(p_candidate_ids, 1) is null then
    raise exception 'candidate ids are required' using errcode = '22023';
  end if;

  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'retail promotion publication requires an administrator account' using errcode = '42501';
  end if;

  foreach v_candidate_id in array p_candidate_ids loop
    select *
    into v_candidate
    from public.retail_price_candidates
    where id = v_candidate_id
    for update;

    if not found then
      v_rejected_ids := array_append(v_rejected_ids, v_candidate_id);
      continue;
    end if;

    if v_candidate.status = 'published' and v_candidate.published_promotion_id is not null then
      v_ignored_ids := array_append(v_ignored_ids, v_candidate.id);
      continue;
    end if;

    if v_candidate.status <> 'approved_promotion'
       or v_candidate.promotion_proven is not true
       or v_candidate.promotion_evidence is null
       or v_candidate.current_price <= 0
       or v_candidate.matched_market_product_id is null then
      v_rejected_ids := array_append(v_rejected_ids, v_candidate.id);
      continue;
    end if;

    v_shopping_product_id := public.retail_resolve_or_create_shopping_product(v_candidate.id);

    select id
    into v_store_location_id
    from public.shopping_store_locations
    where retailer_slug is not distinct from v_candidate.retailer_slug
      and store_name is not distinct from v_candidate.store_name
      and commune is not distinct from coalesce(v_candidate.store_city, v_candidate.store_name)
    limit 1;

    if v_store_location_id is null then
      insert into public.shopping_store_locations (
        retailer_slug,
        retailer_name,
        store_name,
        commune,
        locality,
        website_url,
        is_active,
        updated_at
      )
      values (
        v_candidate.retailer_slug,
        v_candidate.retailer_name,
        v_candidate.store_name,
        coalesce(v_candidate.store_city, v_candidate.store_name),
        v_candidate.store_city,
        v_candidate.source_url,
        true,
        now()
      )
      returning id into v_store_location_id;
    else
      update public.shopping_store_locations
      set
        retailer_name = v_candidate.retailer_name,
        locality = v_candidate.store_city,
        website_url = v_candidate.source_url,
        is_active = true,
        updated_at = now()
      where id = v_store_location_id;
    end if;

    v_observed_at_day := to_char(v_candidate.source_observed_at at time zone 'UTC', 'YYYY-MM-DD');

    select id
    into v_catalog_id
    from public.shopping_catalogs
    where collector_source_slug = 'leader-price-reunion-retail'
      and external_key = format('retail-run:%s:%s', v_candidate.source_run_id, v_candidate.store_slug)
    limit 1;

    if v_catalog_id is null then
      insert into public.shopping_catalogs (
        external_key,
        collector_source_slug,
        retailer_slug,
        retailer_name,
        title,
        description,
        scope_type,
        commune,
        micro_region,
        store_location_id,
        starts_at,
        ends_at,
        source_url,
        source_kind,
        verification_status,
        is_featured,
        is_active,
        updated_at
      )
      values (
        format('retail-run:%s:%s', v_candidate.source_run_id, v_candidate.store_slug),
        'leader-price-reunion-retail',
        v_candidate.retailer_slug,
        v_candidate.retailer_name,
        format('Leader Price - %s - promotions observees le %s', v_candidate.store_name, v_observed_at_day),
        format('Collecte structuree Leader Price %s pour %s.', v_candidate.store_name, v_observed_at_day),
        'store',
        coalesce(v_candidate.store_city, v_candidate.store_name),
        null,
        v_store_location_id,
        v_candidate.starts_at,
        v_candidate.ends_at,
        v_candidate.source_url,
        'collector',
        'published',
        false,
        true,
        now()
      )
      returning id into v_catalog_id;
    else
      update public.shopping_catalogs
      set
        retailer_slug = v_candidate.retailer_slug,
        retailer_name = v_candidate.retailer_name,
        title = format('Leader Price - %s - promotions observees le %s', v_candidate.store_name, v_observed_at_day),
        description = format('Collecte structuree Leader Price %s pour %s.', v_candidate.store_name, v_observed_at_day),
        store_location_id = v_store_location_id,
        starts_at = v_candidate.starts_at,
        ends_at = v_candidate.ends_at,
        source_url = v_candidate.source_url,
        source_kind = 'collector',
        verification_status = 'published',
        is_featured = false,
        is_active = true,
        updated_at = now()
      where id = v_catalog_id;
    end if;

    select id
    into v_promotion_id
    from public.shopping_promotions
    where collector_source_slug = 'leader-price-reunion-retail'
      and external_key = format('retail-promo:%s', v_candidate.id)
    limit 1;

    if v_promotion_id is null then
      insert into public.shopping_promotions (
        external_key,
        collector_source_slug,
        catalog_id,
        product_id,
        store_location_id,
        retailer_slug,
        title,
        offer_text,
        promo_price,
        original_price,
        discount_percent,
        unit_price,
        unit_label,
        conditions,
        starts_at,
        ends_at,
        source_url,
        source_page,
        verification_status,
        is_featured,
        is_active,
        updated_at
      )
      values (
        format('retail-promo:%s', v_candidate.id),
        'leader-price-reunion-retail',
        v_catalog_id,
        v_shopping_product_id,
        v_store_location_id,
        v_candidate.retailer_slug,
        v_candidate.product_name,
        coalesce(v_candidate.promo_badge, v_candidate.conditions, 'Promotion structuree'),
        v_candidate.current_price,
        v_candidate.original_price,
        v_candidate.discount_percent,
        v_candidate.unit_price,
        v_candidate.unit_price_unit,
        v_candidate.conditions,
        v_candidate.starts_at,
        v_candidate.ends_at,
        v_candidate.source_url,
        v_candidate.product_url,
        'published',
        false,
        true,
        now()
      )
      returning id into v_promotion_id;
      v_created_ids := array_append(v_created_ids, v_promotion_id);
    else
      update public.shopping_promotions
      set
        catalog_id = v_catalog_id,
        product_id = v_shopping_product_id,
        store_location_id = v_store_location_id,
        retailer_slug = v_candidate.retailer_slug,
        title = v_candidate.product_name,
        offer_text = coalesce(v_candidate.promo_badge, v_candidate.conditions, 'Promotion structuree'),
        promo_price = v_candidate.current_price,
        original_price = v_candidate.original_price,
        discount_percent = v_candidate.discount_percent,
        unit_price = v_candidate.unit_price,
        unit_label = v_candidate.unit_price_unit,
        conditions = v_candidate.conditions,
        starts_at = v_candidate.starts_at,
        ends_at = v_candidate.ends_at,
        source_url = v_candidate.source_url,
        source_page = v_candidate.product_url,
        verification_status = 'published',
        is_featured = false,
        is_active = true,
        updated_at = now()
      where id = v_promotion_id;
      v_updated_ids := array_append(v_updated_ids, v_promotion_id);
    end if;

    select *
    into v_result
    from public.retail_upsert_price_observation(v_candidate.id, v_candidate.matched_market_product_id, v_shopping_product_id, v_promotion_id);

    update public.retail_price_candidates
    set
      status = 'published',
      matched_shopping_product_id = v_shopping_product_id,
      published_price_observation_id = v_result.observation_id,
      published_promotion_id = v_promotion_id,
      last_seen_at = greatest(last_seen_at, source_observed_at),
      updated_at = now()
    where id = v_candidate.id;
  end loop;

  return jsonb_build_object(
    'created', to_jsonb(coalesce(v_created_ids, '{}'::uuid[])),
    'updated', to_jsonb(coalesce(v_updated_ids, '{}'::uuid[])),
    'ignored', to_jsonb(coalesce(v_ignored_ids, '{}'::uuid[])),
    'rejected', to_jsonb(coalesce(v_rejected_ids, '{}'::uuid[]))
  );
end;
$$;

alter function public.retail_publish_promotion_candidates(uuid[]) owner to postgres;
revoke all on function public.retail_publish_promotion_candidates(uuid[]) from public, anon;
grant execute on function public.retail_publish_promotion_candidates(uuid[]) to authenticated, service_role, postgres;

create or replace function public.retail_cleanup_candidates_dry_run(p_older_than interval default interval '90 days')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'retail cleanup preview requires an administrator account' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'cutoff', now() - p_older_than,
    'rejected_candidates', (
      select count(*)
      from public.retail_price_candidates
      where status = 'rejected'
        and updated_at < now() - p_older_than
    ),
    'duplicate_candidates', (
      select count(*)
      from public.retail_price_candidates
      where status = 'duplicate'
        and updated_at < now() - p_older_than
    ),
    'old_debug_logs_recommended', 0
  );
end;
$$;

alter function public.retail_cleanup_candidates_dry_run(interval) owner to postgres;
revoke all on function public.retail_cleanup_candidates_dry_run(interval) from public, anon;
grant execute on function public.retail_cleanup_candidates_dry_run(interval) to authenticated, service_role, postgres;

drop view if exists public.retail_price_candidates_review;
create view public.retail_price_candidates_review
with (security_invoker = true)
as
select
  candidates.id,
  candidates.source_run_id,
  candidates.source_type,
  candidates.source_product_id,
  candidates.source_url,
  candidates.source_observed_at,
  candidates.retailer_slug,
  candidates.retailer_name,
  candidates.store_slug,
  candidates.store_name,
  candidates.store_city,
  candidates.channel,
  candidates.source_category,
  candidates.source_subcategory,
  candidates.raw_product_name,
  candidates.product_name,
  candidates.normalized_product_name,
  candidates.brand,
  candidates.package_format,
  candidates.quantity_value,
  candidates.quantity_unit,
  candidates.pack_count,
  candidates.total_quantity_value,
  candidates.total_quantity_unit,
  candidates.barcode,
  candidates.image_url,
  candidates.product_url,
  candidates.current_price,
  candidates.original_price,
  candidates.unit_price,
  candidates.unit_price_unit,
  candidates.currency,
  candidates.price_type,
  candidates.promotion_proven,
  candidates.promotion_evidence,
  candidates.promo_badge,
  candidates.discount_percent,
  candidates.loyalty_amount,
  candidates.loyalty_type,
  candidates.offer_mechanism,
  candidates.conditions,
  candidates.starts_at,
  candidates.ends_at,
  candidates.matched_market_product_id,
  market_products.canonical_name as matched_market_product_name,
  market_products.brand as matched_market_product_brand,
  market_products.product_key as matched_market_product_key,
  candidates.matched_shopping_product_id,
  shopping_products.display_name as matched_shopping_product_name,
  candidates.match_method,
  candidates.match_confidence,
  candidates.match_warnings,
  candidates.status,
  candidates.validation_errors,
  candidates.review_notes,
  candidates.reviewed_by,
  candidates.reviewed_at,
  candidates.published_price_observation_id,
  candidates.published_promotion_id,
  candidates.duplicate_key,
  candidates.extraction_confidence,
  candidates.first_seen_at,
  candidates.last_seen_at,
  candidates.created_at,
  candidates.updated_at
from public.retail_price_candidates as candidates
left join public.market_products
  on market_products.id = candidates.matched_market_product_id
left join public.shopping_products
  on shopping_products.id = candidates.matched_shopping_product_id;

drop view if exists public.retail_price_candidate_runs_review;
create view public.retail_price_candidate_runs_review
with (security_invoker = true)
as
select
  source_run_id,
  source_type,
  retailer_slug,
  retailer_name,
  store_slug,
  store_name,
  store_city,
  min(source_observed_at) as first_observed_at,
  max(source_observed_at) as last_observed_at,
  count(*) as candidates_total,
  count(*) filter (where price_type = 'observed_price') as observed_prices_total,
  count(*) filter (where price_type = 'promotion' and promotion_proven = true) as promotions_total,
  count(*) filter (where matched_market_product_id is not null) as matched_total,
  count(*) filter (where matched_market_product_id is null) as unmatched_total,
  count(*) filter (where status = 'needs_review') as needs_review_total,
  count(*) filter (where status = 'rejected') as rejected_total,
  count(*) filter (where status = 'duplicate') as duplicate_total,
  count(*) filter (where status = 'published') as published_total,
  min(created_at) as imported_at,
  max(updated_at) as updated_at
from public.retail_price_candidates
group by
  source_run_id,
  source_type,
  retailer_slug,
  retailer_name,
  store_slug,
  store_name,
  store_city;

alter table public.retail_price_candidates enable row level security;
alter table public.retail_price_observations enable row level security;

revoke all on table public.retail_price_candidates from public, anon, authenticated;
revoke all on table public.retail_price_observations from public, anon, authenticated;
revoke all on public.retail_price_candidates_review from public, anon, authenticated;
revoke all on public.retail_price_candidate_runs_review from public, anon, authenticated;

grant all on table public.retail_price_candidates to postgres, service_role;
grant all on table public.retail_price_observations to postgres, service_role;
grant select, update on table public.retail_price_candidates to authenticated;
grant select on table public.retail_price_observations to authenticated;
grant select on public.retail_price_candidates_review to authenticated;
grant select on public.retail_price_candidate_runs_review to authenticated;

grant select on table public.market_products to authenticated;
grant select on table public.shopping_products to authenticated;

drop policy if exists "Retail candidates admin read" on public.retail_price_candidates;
create policy "Retail candidates admin read"
  on public.retail_price_candidates
  for select
  to authenticated
  using (public.good_deals_is_admin());

drop policy if exists "Retail candidates admin update" on public.retail_price_candidates;
create policy "Retail candidates admin update"
  on public.retail_price_candidates
  for update
  to authenticated
  using (public.good_deals_is_admin())
  with check (public.good_deals_is_admin());

drop policy if exists "Retail observations admin read" on public.retail_price_observations;
create policy "Retail observations admin read"
  on public.retail_price_observations
  for select
  to authenticated
  using (public.good_deals_is_admin());

drop policy if exists "Market products admin read" on public.market_products;
create policy "Market products admin read"
  on public.market_products
  for select
  to authenticated
  using (public.good_deals_is_admin());

drop policy if exists "Shopping products admin read" on public.shopping_products;
create policy "Shopping products admin read"
  on public.shopping_products
  for select
  to authenticated
  using (public.good_deals_is_admin());

comment on table public.retail_price_candidates is
  'Staging generic des prix retail structures avant validation admin et publication separee des prix et promotions.';
comment on table public.retail_price_observations is
  'Historique compact des prix retail publies, avec first_seen_at/last_seen_at pour eviter la surcharge.';

commit;
