begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_stores_retailer_scope_has_no_city'
      and conrelid = 'public.market_stores'::regclass
  ) then
    alter table public.market_stores
      add constraint market_stores_retailer_scope_has_no_city
      check (
        store_type is distinct from 'retailer_scope'
        or (
          city is null
          and normalized_city = ''
        )
      );
  end if;
end
$$;

insert into public.market_stores (
  store_name,
  normalized_store_name,
  city,
  normalized_city,
  island_region,
  store_type,
  store_key
)
values
  (
    'Carrefour Réunion',
    public.market_normalize_text('Carrefour Réunion'),
    null,
    '',
    'La Réunion',
    'retailer_scope',
    'carrefour reunion||la reunion'
  ),
  (
    'Carrefour Market Réunion',
    public.market_normalize_text('Carrefour Market Réunion'),
    null,
    '',
    'La Réunion',
    'retailer_scope',
    'carrefour market reunion||la reunion'
  ),
  (
    'Carrefour City Réunion',
    public.market_normalize_text('Carrefour City Réunion'),
    null,
    '',
    'La Réunion',
    'retailer_scope',
    'carrefour city reunion||la reunion'
  )
on conflict (store_key) do update
set
  store_name = excluded.store_name,
  normalized_store_name = excluded.normalized_store_name,
  city = null,
  normalized_city = '',
  island_region = excluded.island_region,
  store_type = excluded.store_type;

insert into public.retail_market_store_mappings (
  retailer_slug,
  store_slug,
  market_store_id
)
select
  scopes.retailer_slug,
  scopes.store_slug,
  stores.id
from (
  values
    (
      'carrefour-reunion'::text,
      'carrefour-reunion'::text,
      'carrefour reunion||la reunion'::text
    ),
    (
      'carrefour-market-reunion'::text,
      'carrefour-market-reunion'::text,
      'carrefour market reunion||la reunion'::text
    ),
    (
      'carrefour-city-reunion'::text,
      'carrefour-city-reunion'::text,
      'carrefour city reunion||la reunion'::text
    )
) as scopes(retailer_slug, store_slug, store_key)
join public.market_stores stores
  on stores.store_key = scopes.store_key
on conflict (retailer_slug, store_slug) do update
set market_store_id = excluded.market_store_id;

create or replace function public.retail_publish_promotion_candidates_active(p_candidate_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_candidate_id uuid;
  v_candidate public.retail_price_candidates%rowtype;
  v_retail_result record;
  v_market_result record;
  v_market_store_id uuid;
  v_store_location_id uuid;
  v_catalog_id uuid;
  v_shopping_product_id uuid;
  v_promotion_id uuid;
  v_observed_at_day text;
  v_catalog_scope_type text;
  v_created_ids uuid[] := '{}'::uuid[];
  v_updated_ids uuid[] := '{}'::uuid[];
  v_market_created_ids uuid[] := '{}'::uuid[];
  v_market_updated_ids uuid[] := '{}'::uuid[];
  v_ignored_ids uuid[] := '{}'::uuid[];
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
      raise exception 'retail price candidate not found: %', v_candidate_id using errcode = 'P0002';
    end if;

    if v_candidate.status = 'published' then
      if v_candidate.published_price_observation_id is null
         or v_candidate.published_promotion_id is null
         or v_candidate.published_market_observation_id is null then
        raise exception 'published retail promotion candidate is missing publication links: %', v_candidate.id
          using errcode = '22000';
      end if;

      v_ignored_ids := array_append(v_ignored_ids, v_candidate.id);
      continue;
    end if;

    if v_candidate.status <> 'approved_promotion'
       or v_candidate.promotion_proven is not true
       or v_candidate.promotion_evidence is null
       or v_candidate.current_price <= 0
       or v_candidate.matched_market_product_id is null then
      raise exception 'retail promotion candidate is missing publication requirements: %', v_candidate.id
        using errcode = '22000';
    end if;

    v_market_store_id := public.retail_resolve_market_store(v_candidate.id);
    v_shopping_product_id := public.retail_resolve_or_create_shopping_product(v_candidate.id);

    v_store_location_id := null;
    v_catalog_scope_type := case
      when nullif(trim(coalesce(v_candidate.store_city, '')), '') is null then 'island'
      else 'store'
    end;

    if v_catalog_scope_type = 'store' then
      select id
      into v_store_location_id
      from public.shopping_store_locations
      where retailer_slug is not distinct from v_candidate.retailer_slug
        and store_name is not distinct from v_candidate.store_name
        and commune is not distinct from v_candidate.store_city
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
          v_candidate.store_city,
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
        format('%s - promotions observees le %s', v_candidate.store_name, v_observed_at_day),
        format('Collecte structuree %s pour %s.', v_candidate.store_name, v_observed_at_day),
        v_catalog_scope_type,
        v_candidate.store_city,
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
        title = format('%s - promotions observees le %s', v_candidate.store_name, v_observed_at_day),
        description = format('Collecte structuree %s pour %s.', v_candidate.store_name, v_observed_at_day),
        scope_type = v_catalog_scope_type,
        commune = v_candidate.store_city,
        micro_region = null,
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
    into v_retail_result
    from public.retail_upsert_price_observation(
      v_candidate.id,
      v_candidate.matched_market_product_id,
      v_shopping_product_id,
      v_promotion_id
    );

    if not found or v_retail_result.observation_id is null then
      raise exception 'retail promotion publication failed to persist the retail observation for candidate %', v_candidate.id
        using errcode = '22000';
    end if;

    select *
    into v_market_result
    from public.retail_sync_market_price_observation(
      v_candidate.id,
      v_retail_result.observation_id,
      v_market_store_id,
      v_promotion_id
    );

    if not found or v_market_result.observation_id is null then
      raise exception 'retail promotion publication failed to persist the market observation for candidate %', v_candidate.id
        using errcode = '22000';
    end if;

    if v_market_result.action = 'created' then
      v_market_created_ids := array_append(v_market_created_ids, v_market_result.observation_id);
    else
      v_market_updated_ids := array_append(v_market_updated_ids, v_market_result.observation_id);
    end if;

    update public.retail_price_candidates
    set
      status = 'published',
      matched_shopping_product_id = v_shopping_product_id,
      published_price_observation_id = v_retail_result.observation_id,
      published_promotion_id = v_promotion_id,
      published_market_observation_id = v_market_result.observation_id,
      last_seen_at = greatest(last_seen_at, source_observed_at),
      updated_at = now()
    where id = v_candidate.id;
  end loop;

  return jsonb_build_object(
    'created', to_jsonb(coalesce(v_created_ids, '{}'::uuid[])),
    'updated', to_jsonb(coalesce(v_updated_ids, '{}'::uuid[])),
    'market_created', to_jsonb(coalesce(v_market_created_ids, '{}'::uuid[])),
    'market_updated', to_jsonb(coalesce(v_market_updated_ids, '{}'::uuid[])),
    'ignored', to_jsonb(coalesce(v_ignored_ids, '{}'::uuid[])),
    'rejected', '[]'::jsonb
  );
end;
$$;

alter function public.retail_publish_promotion_candidates_active(uuid[]) owner to postgres;
revoke all on function public.retail_publish_promotion_candidates_active(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.retail_publish_promotion_candidates_active(uuid[])
  to postgres;

create or replace view public.published_good_deals
as
with base_good_deals as (
  select
    gd.id,
    gd.business_id,
    gd.title,
    gd.description,
    gd.conditions,
    gd.category,
    gd.scope_type as scope_type,
    gd.commune,
    gd.micro_region,
    gd.radius_km,
    gd.starts_at,
    gd.ends_at,
    gd.source_url,
    gd.contact_url,
    gd.is_sponsored,
    gd.is_featured,
    gd.created_at,
    gd.updated_at,
    b.name as business_name,
    b.description as business_description,
    b.address as business_address,
    b.commune as business_commune,
    b.postal_code as business_postal_code,
    b.latitude as business_latitude,
    b.longitude as business_longitude,
    b.phone as business_phone,
    b.website_url as business_website_url,
    b.social_url as business_social_url,
    b.logo_url as business_logo_url,
    b.is_verified as business_is_verified,
    b.is_partner as business_is_partner,
    gd.deal_type as deal_type,
    gd.tags,
    gd.is_free,
    gd.price_note,
    gd.content_kind as content_kind,
    gd.locality,
    gd.territory_name,
    gd.opening_hours_note,
    gd.booking_required,
    gd.minimum_age,
    gd.audience,
    gd.availability_status::text as availability_status,
    gd.last_verified_at,
    gd.verification_due_at,
    gd.access_warning
  from public.good_deals gd
  left join public.good_deal_businesses b on b.id = gd.business_id
  where gd.is_active = true
    and gd.verification_status = 'published'::good_deal_verification_status
    and (gd.ends_at is null or gd.ends_at >= now())
    and gd.source_still_available is not false
    and coalesce(gd.availability_status, 'active') <> 'expired'
    and (b.id is null or b.is_active = true)
),
retail_promotions as (
  select
    promotions.id,
    null::uuid as business_id,
    coalesce(promotions.title, shopping_products.display_name, retail_candidates.product_name, 'Promotion retail') as title,
    coalesce(promotions.offer_text, promotions.conditions, retail_candidates.product_name, 'Promotion retail structuree') as description,
    promotions.conditions,
    'shopping'::text as category,
    case
      when nullif(trim(coalesce(retail_candidates.store_city, '')), '') is null
        then 'island'::public.good_deal_scope_type
      else coalesce(catalogs.scope_type::text::public.good_deal_scope_type, 'commune'::public.good_deal_scope_type)
    end as scope_type,
    retail_candidates.store_city as commune,
    catalogs.micro_region,
    null::numeric(6,2) as radius_km,
    promotions.starts_at,
    promotions.ends_at,
    coalesce(promotions.source_url, catalogs.source_url) as source_url,
    null::text as contact_url,
    false as is_sponsored,
    coalesce(promotions.is_featured, false) as is_featured,
    promotions.created_at,
    promotions.updated_at,
    coalesce(catalogs.retailer_name, retail_candidates.retailer_name, initcap(replace(promotions.retailer_slug, '-', ' '))) as business_name,
    null::text as business_description,
    null::text as business_address,
    stores.commune as business_commune,
    null::text as business_postal_code,
    null::numeric(9,6) as business_latitude,
    null::numeric(9,6) as business_longitude,
    null::text as business_phone,
    stores.website_url as business_website_url,
    null::text as business_social_url,
    null::text as business_logo_url,
    false as business_is_verified,
    false as business_is_partner,
    null::public.good_deal_type as deal_type,
    array['product_promo']::text[] as tags,
    false as is_free,
    concat_ws(
      ' - ',
      concat('Prix promo ', trim(to_char(promotions.promo_price, 'FM999999990D00')), ' EUR'),
      case
        when promotions.original_price is not null
          then concat('Au lieu de ', trim(to_char(promotions.original_price, 'FM999999990D00')), ' EUR')
        else null
      end,
      case
        when promotions.unit_price is not null and nullif(promotions.unit_label, '') is not null
          then concat(trim(to_char(promotions.unit_price, 'FM999999990D00')), ' EUR/', promotions.unit_label)
        else null
      end
    ) as price_note,
    'promotion'::public.good_deal_content_kind as content_kind,
    retail_candidates.store_name as locality,
    null::text as territory_name,
    null::text as opening_hours_note,
    null::boolean as booking_required,
    null::integer as minimum_age,
    null::text as audience,
    'active'::text as availability_status,
    coalesce(promotions.updated_at, promotions.starts_at, catalogs.updated_at) as last_verified_at,
    promotions.ends_at as verification_due_at,
    null::text as access_warning
  from public.shopping_promotions promotions
  join public.retail_price_candidates retail_candidates
    on retail_candidates.published_promotion_id = promotions.id
   and retail_candidates.status = 'published'
   and retail_candidates.price_type = 'promotion'
   and retail_candidates.matched_market_product_id is not null
   and retail_candidates.published_price_observation_id is not null
   and retail_candidates.published_market_observation_id is not null
  left join public.shopping_catalogs catalogs
    on catalogs.id = promotions.catalog_id
  left join public.shopping_store_locations stores
    on stores.id = promotions.store_location_id
  left join public.shopping_products shopping_products
    on shopping_products.id = promotions.product_id
  where promotions.collector_source_slug = 'leader-price-reunion-retail'
    and promotions.verification_status = 'published'
    and coalesce(promotions.is_active, true) = true
    and (promotions.ends_at is null or promotions.ends_at >= now())
    and not exists (
      select 1
      from public.good_deals gd
      where gd.collector_source_slug = promotions.collector_source_slug
        and gd.external_key = promotions.external_key
        and gd.is_active = true
        and gd.verification_status = 'published'::good_deal_verification_status
    )
),
retail_observed_prices as (
  select
    observations.id,
    null::uuid as business_id,
    coalesce(shopping_products.display_name, retail_candidates.product_name, market_products.canonical_name, 'Prix observe retail') as title,
    concat_ws(
      ' - ',
      nullif(
        concat_ws(
          ' · ',
          nullif(retail_candidates.brand, ''),
          nullif(retail_candidates.package_format, '')
        ),
        ''
      ),
      concat('Prix observe le ', to_char(observations.observed_at at time zone 'Indian/Reunion', 'DD/MM/YYYY'))
    ) as description,
    observations.offer_mechanism as conditions,
    'shopping'::text as category,
    case
      when nullif(trim(coalesce(retail_candidates.store_city, '')), '') is null
        then 'island'::public.good_deal_scope_type
      else 'commune'::public.good_deal_scope_type
    end as scope_type,
    coalesce(observations.store_city, retail_candidates.store_city) as commune,
    null::text as micro_region,
    null::numeric(6,2) as radius_km,
    null::timestamptz as starts_at,
    null::timestamptz as ends_at,
    observations.source_url,
    null::text as contact_url,
    false as is_sponsored,
    false as is_featured,
    observations.created_at,
    observations.updated_at,
    coalesce(retail_candidates.retailer_name, initcap(replace(observations.retailer_slug, '-', ' '))) as business_name,
    null::text as business_description,
    null::text as business_address,
    observations.store_city as business_commune,
    null::text as business_postal_code,
    null::numeric(9,6) as business_latitude,
    null::numeric(9,6) as business_longitude,
    null::text as business_phone,
    null::text as business_website_url,
    null::text as business_social_url,
    null::text as business_logo_url,
    false as business_is_verified,
    false as business_is_partner,
    null::public.good_deal_type as deal_type,
    array['observed_price']::text[] as tags,
    false as is_free,
    concat_ws(
      ' - ',
      concat('Prix observe ', trim(to_char(observations.price, 'FM999999990D00')), ' EUR'),
      case
        when observations.unit_price is not null and nullif(observations.unit_price_unit, '') is not null
          then concat(trim(to_char(observations.unit_price, 'FM999999990D00')), ' EUR/', observations.unit_price_unit)
        else null
      end,
      case
        when observations.promotion_proven is true and observations.original_price is not null
          then concat('Au lieu de ', trim(to_char(observations.original_price, 'FM999999990D00')), ' EUR')
        else null
      end
    ) as price_note,
    'observed_price'::public.good_deal_content_kind as content_kind,
    observations.store_name as locality,
    null::text as territory_name,
    null::text as opening_hours_note,
    null::boolean as booking_required,
    null::integer as minimum_age,
    null::text as audience,
    'active'::text as availability_status,
    coalesce(observations.last_seen_at, observations.observed_at, observations.updated_at) as last_verified_at,
    null::timestamptz as verification_due_at,
    null::text as access_warning
  from public.retail_price_observations observations
  join public.retail_price_candidates retail_candidates
    on retail_candidates.published_price_observation_id = observations.id
   and retail_candidates.status = 'published'
   and retail_candidates.price_type = 'observed_price'
   and retail_candidates.matched_market_product_id is not null
   and retail_candidates.published_market_observation_id is not null
  left join public.market_products market_products
    on market_products.id = observations.market_product_id
  left join public.shopping_products shopping_products
    on shopping_products.id = observations.shopping_product_id
)
select * from base_good_deals
union all
select * from retail_promotions
union all
select * from retail_observed_prices;

comment on view public.published_good_deals is
  'Vue publique reunissant les bons plans publies ainsi que les promotions et prix observes retail publies via le flux admin.';

commit;
