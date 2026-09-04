-- BudgetKazPei
-- Consolidation du domaine promotions retail.
--
-- Cette migration ne modifie aucune migration historique. Elle :
--   * centralise la fenetre observed_freshness de 36 heures ;
--   * rend l'idempotence concurrente explicite pour une offre active ;
--   * expose un contrat public minimal, deja filtre et presentable par l'UI.

begin;

create or replace function public.retail_observed_freshness_window()
returns interval
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select interval '36 hours'
$$;

alter function public.retail_observed_freshness_window() owner to postgres;
revoke all on function public.retail_observed_freshness_window() from public, anon, authenticated;
grant execute on function public.retail_observed_freshness_window() to postgres, service_role;

comment on function public.retail_observed_freshness_window() is
  'Fenetre technique unique des promotions Leader Drive sans dates officielles : 36 heures.';

create or replace function public.shopping_promotions_enforce_date_basis()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $budgetkazpei_trigger$
declare
  v_candidate_id_text text;
  v_candidate public.retail_price_candidates%rowtype;
  v_identity_lock text;
begin
  if tg_op = 'UPDATE'
     and old.date_basis = 'observed_freshness'
     and new.is_active is false then
    new.catalog_id := null;
    new.starts_at := null;
    new.ends_at := null;
    new.date_basis := 'observed_freshness';
    new.observed_at := old.observed_at;
    new.fresh_until := old.fresh_until;
    return new;
  end if;

  if new.starts_at is not null and new.ends_at is not null then
    if new.ends_at < new.starts_at then
      raise exception 'shopping promotion ends_at cannot be before starts_at';
    end if;

    new.date_basis := 'official';
    new.observed_at := null;
    new.fresh_until := null;
    return new;
  end if;

  if (new.starts_at is null) <> (new.ends_at is null) then
    raise exception 'shopping promotion requires both starts_at and ends_at, or neither for approved Leader Drive freshness mode';
  end if;

  if new.collector_source_slug is distinct from 'leader-price-reunion-retail' then
    raise exception 'undated shopping promotions are restricted to leader-price-reunion-retail';
  end if;

  if new.product_id is null then
    raise exception 'undated Leader Price promotion requires a stable shopping product identity';
  end if;

  if new.external_key is null
     or new.external_key !~ '^retail-promo:[0-9a-fA-F-]{36}$' then
    raise exception 'undated Leader Price promotion requires a retail-promo candidate external_key';
  end if;

  v_candidate_id_text := substring(new.external_key from length('retail-promo:') + 1);

  select *
  into v_candidate
  from public.retail_price_candidates
  where id = v_candidate_id_text::uuid;

  if not found then
    raise exception 'Leader Price retail candidate not found for promotion %', new.external_key;
  end if;

  if v_candidate.retailer_slug is distinct from 'leader-price-reunion'
     or v_candidate.source_type is distinct from 'leader_drive_html' then
    raise exception 'undated promotion candidate is not a Leader Drive candidate';
  end if;

  if new.retailer_slug is distinct from v_candidate.retailer_slug then
    raise exception 'undated promotion retailer does not match its Leader Drive candidate';
  end if;

  if v_candidate.source_observed_at is null
     or v_candidate.source_observed_at < now() - public.retail_observed_freshness_window() then
    raise exception 'undated Leader Price promotion observation is outside the freshness window';
  end if;

  if v_candidate.promotion_proven is not true
     or v_candidate.promotion_evidence is null
     or v_candidate.current_price is null
     or v_candidate.current_price <= 0
     or v_candidate.original_price is null
     or v_candidate.original_price <= v_candidate.current_price then
    raise exception 'undated Leader Price promotion lacks proven direct discount evidence';
  end if;

  if coalesce(v_candidate.validation_errors, '[]'::jsonb) <> '[]'::jsonb then
    raise exception 'undated Leader Price promotion has validation errors';
  end if;

  if not (
    coalesce(v_candidate.match_warnings, '[]'::jsonb)
      <@ '["matching_backend_unavailable_in_local_session"]'::jsonb
  ) then
    raise exception 'undated Leader Price promotion has blocking matching warnings';
  end if;

  new.catalog_id := null;
  new.starts_at := null;
  new.ends_at := null;
  new.observed_at := v_candidate.source_observed_at;
  new.fresh_until := v_candidate.source_observed_at + public.retail_observed_freshness_window();
  new.date_basis := 'observed_freshness';

  -- Serialise les ecritures d'une meme identite retailer/produit/magasin.
  -- Le verrou est transactionnel et ne persiste pas apres COMMIT/ROLLBACK.
  v_identity_lock := concat_ws(
    '|',
    new.retailer_slug,
    new.product_id::text,
    coalesce(new.store_location_id::text, 'all-stores')
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_lock, 0));

  new.is_active := new.fresh_until > now()
    and not exists (
      select 1
      from public.shopping_promotions newer
      where newer.id <> new.id
        and newer.date_basis = 'observed_freshness'
        and newer.is_active is true
        and newer.retailer_slug is not distinct from new.retailer_slug
        and newer.product_id is not distinct from new.product_id
        and newer.store_location_id is not distinct from new.store_location_id
        and (
          newer.observed_at > new.observed_at
          or (newer.observed_at = new.observed_at and newer.id::text > new.id::text)
        )
    );

  -- L'index unique est verifie avant le trigger AFTER. L'ancienne observation
  -- doit donc etre desactivee ici, sous le meme verrou, avant l'insertion de
  -- la nouvelle ligne active.
  if new.is_active is true then
    update public.shopping_promotions as older
    set
      is_active = false,
      updated_at = now()
    where older.id <> new.id
      and older.date_basis = 'observed_freshness'
      and older.is_active is true
      and older.retailer_slug is not distinct from new.retailer_slug
      and older.product_id is not distinct from new.product_id
      and older.store_location_id is not distinct from new.store_location_id
      and (
        older.observed_at < new.observed_at
        or (older.observed_at = new.observed_at and older.id::text < new.id::text)
      );
  end if;

  return new;
end;
$budgetkazpei_trigger$;

alter function public.shopping_promotions_enforce_date_basis() owner to postgres;
revoke all on function public.shopping_promotions_enforce_date_basis() from public, anon, authenticated;

-- Nettoyage defensif avant la contrainte : seule l'observation la plus recente
-- reste active, l'historique demeure conserve dans la table.
with ranked as (
  select
    id,
    row_number() over (
      partition by retailer_slug, product_id, store_location_id
      order by observed_at desc, updated_at desc, id desc
    ) as position
  from public.shopping_promotions
  where date_basis = 'observed_freshness'
    and is_active is true
    and product_id is not null
)
update public.shopping_promotions promotion
set
  is_active = false,
  updated_at = now()
from ranked
where promotion.id = ranked.id
  and ranked.position > 1;

create unique index if not exists shopping_promotions_one_active_observed_offer_uk
  on public.shopping_promotions (
    retailer_slug,
    product_id,
    coalesce(store_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where date_basis = 'observed_freshness'
    and is_active is true
    and product_id is not null;

create or replace view public.published_retail_promotions
with (security_barrier = true)
as
with eligible as (
  select
    promotions.id,
    promotions.product_id,
    candidates.matched_market_product_id as market_product_id,
    coalesce(promotions.title, products.display_name, candidates.product_name) as product_name,
    nullif(trim(candidates.brand), '') as brand,
    nullif(trim(candidates.package_format), '') as package_format,
    candidates.quantity_value,
    candidates.quantity_unit,
    candidates.pack_count,
    candidates.total_quantity_value,
    candidates.total_quantity_unit,
    nullif(trim(candidates.barcode), '') as barcode,
    promotions.retailer_slug,
    candidates.retailer_name,
    promotions.store_location_id,
    candidates.store_name,
    candidates.store_city,
    promotions.promo_price,
    promotions.original_price,
    greatest(promotions.original_price - promotions.promo_price, 0::numeric) as discount_amount,
    promotions.discount_percent,
    promotions.unit_price,
    promotions.unit_label,
    promotions.starts_at,
    promotions.ends_at,
    promotions.date_basis,
    promotions.observed_at,
    promotions.fresh_until,
    promotions.is_active,
    case
      when promotions.date_basis = 'official'
        then promotions.starts_at <= now() and promotions.ends_at >= now()
      when promotions.date_basis = 'observed_freshness'
        then promotions.fresh_until > now()
      else false
    end as is_fresh,
    candidates.promotion_proven,
    promotions.source_url,
    promotions.collector_source_slug,
    promotions.catalog_id,
    candidates.source_type,
    candidates.match_method,
    candidates.match_confidence,
    promotions.conditions,
    promotions.offer_text,
    promotions.is_featured,
    promotions.created_at,
    promotions.updated_at,
    case
      when promotions.date_basis = 'observed_freshness' then
        row_number() over (
          partition by promotions.retailer_slug, promotions.product_id, promotions.store_location_id, promotions.date_basis
          order by promotions.observed_at desc, promotions.updated_at desc, promotions.id desc
        )
      else 1
    end as identity_position
  from public.shopping_promotions promotions
  join lateral (
    select candidate.*
    from public.retail_price_candidates candidate
    where candidate.published_promotion_id = promotions.id
      and candidate.status = 'published'
      and candidate.price_type = 'promotion'
      and candidate.matched_market_product_id is not null
      and candidate.published_price_observation_id is not null
      and candidate.published_market_observation_id is not null
    order by candidate.source_observed_at desc, candidate.updated_at desc, candidate.id desc
    limit 1
  ) candidates on true
  left join public.shopping_products products on products.id = promotions.product_id
  where promotions.verification_status = 'published'
    and promotions.is_active is true
    and promotions.product_id is not null
    and promotions.promo_price > 0
    and promotions.original_price > promotions.promo_price
    and candidates.promotion_proven is true
    and candidates.promotion_evidence is not null
    and candidates.promotion_evidence not in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb)
    and coalesce(candidates.validation_errors, '[]'::jsonb) = '[]'::jsonb
    and coalesce(candidates.match_warnings, '[]'::jsonb)
          <@ '["matching_backend_unavailable_in_local_session"]'::jsonb
    and (
      (
        promotions.date_basis = 'official'
        and promotions.starts_at is not null
        and promotions.ends_at is not null
        and promotions.starts_at <= now()
        and promotions.ends_at >= now()
      )
      or
      (
        promotions.date_basis = 'observed_freshness'
        and promotions.retailer_slug = 'leader-price-reunion'
        and promotions.collector_source_slug = 'leader-price-reunion-retail'
        and candidates.source_type = 'leader_drive_html'
        and promotions.catalog_id is null
        and promotions.starts_at is null
        and promotions.ends_at is null
        and promotions.observed_at is not null
        and promotions.fresh_until > now()
      )
    )
)
select
  id,
  product_id,
  market_product_id,
  product_name,
  brand,
  package_format,
  quantity_value,
  quantity_unit,
  pack_count,
  total_quantity_value,
  total_quantity_unit,
  barcode,
  retailer_slug,
  retailer_name,
  store_location_id,
  store_name,
  store_city,
  promo_price,
  original_price,
  discount_amount,
  discount_percent,
  unit_price,
  unit_label,
  starts_at,
  ends_at,
  date_basis,
  observed_at,
  fresh_until,
  is_active,
  is_fresh,
  promotion_proven,
  source_url,
  collector_source_slug,
  catalog_id,
  source_type,
  match_method,
  match_confidence,
  conditions,
  offer_text,
  is_featured,
  created_at,
  updated_at
from eligible
where identity_position = 1;

alter view public.published_retail_promotions owner to postgres;
revoke all on public.published_retail_promotions from public, anon, authenticated;
grant select on public.published_retail_promotions to anon, authenticated;

comment on view public.published_retail_promotions is
  'Projection publique minimale des promotions retail prouvees, actives, non stale et dedupliquees. La vue masque les preuves et champs de revue internes.';

commit;
