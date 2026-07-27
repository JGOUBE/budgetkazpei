begin;

do $$
declare
  required_table text;
  required_tables text[] := array[
    'public.profiles',
    'public.good_deals',
    'public.good_deal_businesses',
    'public.good_deal_sources',
    'public.good_deal_candidates',
    'public.shopping_catalogs',
    'public.shopping_products',
    'public.shopping_product_aliases',
    'public.shopping_promotions',
    'public.shopping_store_locations'
  ];
begin
  foreach required_table in array required_tables loop
    if to_regclass(required_table) is null then
      raise exception 'Migration 202607270003_good_deals_immediate_publication_enum_casts requires table % to exist before execution.', required_table;
    end if;
  end loop;

  if to_regprocedure('public.good_deals_is_admin()') is null then
    raise exception 'Migration 202607270003_good_deals_immediate_publication_enum_casts requires public.good_deals_is_admin() to exist before execution.';
  end if;

  if to_regprocedure('public.good_deals_normalize_text(text)') is null then
    raise exception 'Migration 202607270003_good_deals_immediate_publication_enum_casts requires public.good_deals_normalize_text(text) to exist before execution.';
  end if;
end $$;

create or replace function public.good_deals_publish_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_candidate public.good_deal_candidates%rowtype;
  v_source public.good_deal_sources%rowtype;
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_now timestamptz := now();
  v_reviewer uuid := auth.uid();
  v_business_id uuid;
  v_store_location_id uuid;
  v_product_id uuid;
  v_catalog_id uuid;
  v_good_deal_id uuid;
  v_category text;
  v_business_name text;
  v_business_slug text;
  v_catalog_candidate boolean := false;
  v_product_promotion_candidate boolean := false;
  v_catalog_external_key text;
  v_product_alias text;
  v_deal_type_text text;
  v_catalog_scope_type public.shopping_catalogs.scope_type%type;
  v_catalog_verification_status public.shopping_catalogs.verification_status%type;
  v_promotion_verification_status public.shopping_promotions.verification_status%type;
  v_good_deal_scope_type public.good_deals.scope_type%type;
  v_good_deal_deal_type public.good_deals.deal_type%type;
  v_good_deal_content_kind public.good_deals.content_kind%type;
  v_good_deal_availability_status public.good_deals.availability_status%type;
  v_good_deal_verification_status public.good_deals.verification_status%type;
begin
  if p_candidate_id is null then
    raise exception 'good deal candidate id is required'
      using errcode = '22023';
  end if;

  if not (
    session_user = 'postgres'
    or v_role = 'service_role'
    or public.good_deals_is_admin()
  ) then
    raise exception 'good deals publication requires an administrator account'
      using errcode = '42501';
  end if;

  select *
  into v_candidate
  from public.good_deal_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'good deal candidate not found: %', p_candidate_id
      using errcode = 'P0002';
  end if;

  select *
  into v_source
  from public.good_deal_sources
  where id = v_candidate.source_id;

  if not found then
    raise exception 'good deal source not found for candidate %', p_candidate_id
      using errcode = 'P0002';
  end if;

  if v_candidate.status = 'published' and v_candidate.published_good_deal_id is not null then
    return v_candidate.published_good_deal_id;
  end if;

  if v_candidate.status in ('rejected', 'duplicate', 'expired') then
    raise exception 'candidate status % cannot be published immediately', v_candidate.status
      using errcode = '22000';
  end if;

  if not exists (
    select 1
    from unnest(enum_range(null::public.good_deal_scope_type)::text[]) as allowed(value)
    where allowed.value = v_candidate.scope_type
  ) then
    raise exception 'invalid scope_type for good deal publication: %', coalesce(v_candidate.scope_type, 'null')
      using errcode = '22000';
  end if;

  if not exists (
    select 1
    from unnest(enum_range(null::public.good_deal_content_kind)::text[]) as allowed(value)
    where allowed.value = v_candidate.content_kind
  ) then
    raise exception 'invalid content_kind for good deal publication: %', coalesce(v_candidate.content_kind, 'null')
      using errcode = '22000';
  end if;

  v_catalog_scope_type := v_candidate.scope_type;
  v_catalog_verification_status := 'published';
  v_promotion_verification_status := 'published';
  v_good_deal_scope_type := v_candidate.scope_type::public.good_deal_scope_type;
  v_good_deal_content_kind := v_candidate.content_kind::public.good_deal_content_kind;
  v_good_deal_verification_status := 'published'::public.good_deal_verification_status;

  select exists (
    select 1
    from unnest(coalesce(v_candidate.tags, '{}'::text[])) as tag(value)
    where lower(tag.value) in ('catalog', 'catalogue')
  )
  into v_catalog_candidate;

  v_product_promotion_candidate := v_candidate.content_kind = 'promotion'
    and not v_catalog_candidate
    and (
      nullif(btrim(coalesce(v_candidate.product_name, '')), '') is not null
      or nullif(btrim(coalesce(v_candidate.normalized_product_name, '')), '') is not null
    );

  v_business_name := coalesce(
    nullif(btrim(coalesce(v_candidate.business_name, '')), ''),
    nullif(btrim(coalesce(v_candidate.organizer_name, '')), ''),
    nullif(btrim(coalesce(v_source.organizer_name, '')), ''),
    nullif(btrim(coalesce(v_source.name, '')), ''),
    nullif(btrim(coalesce(v_candidate.title, '')), '')
  );
  v_business_slug := coalesce(
    nullif(btrim(coalesce(v_candidate.retailer_slug, '')), ''),
    nullif(replace(public.good_deals_normalize_text(v_business_name), ' ', '-'), '')
  );
  v_category := coalesce(
    nullif(btrim(coalesce(v_candidate.category, '')), ''),
    nullif(btrim(coalesce(v_candidate.content_family, '')), ''),
    nullif(btrim(coalesce(v_source.content_family, '')), ''),
    'other'
  );
  v_catalog_external_key := coalesce(
    nullif(btrim(coalesce(v_candidate.external_key, '')), ''),
    format(
      'catalog:%s:%s',
      coalesce(v_source.slug, 'source'),
      coalesce(to_char(v_candidate.starts_at at time zone 'UTC', 'YYYY-MM-DD'), 'undated')
    )
  );
  v_product_alias := nullif(public.good_deals_normalize_text(v_candidate.product_name), '');
  v_deal_type_text := case
    when v_candidate.content_kind = 'event' then 'event'
    when v_candidate.content_kind = 'promotion' then 'promotion'
    when coalesce(v_candidate.is_free, false) then 'free_activity'
    else 'local_service'
  end;

  if not exists (
    select 1
    from unnest(enum_range(null::public.good_deal_type)::text[]) as allowed(value)
    where allowed.value = v_deal_type_text
  ) then
    raise exception 'invalid deal_type for good deal publication: %', coalesce(v_deal_type_text, 'null')
      using errcode = '22000';
  end if;

  v_good_deal_deal_type := v_deal_type_text::public.good_deal_type;
  v_good_deal_availability_status := case
    when v_candidate.content_kind = 'permanent_leisure' then 'open'
    else 'active'
  end;

  if v_business_slug is not null and v_business_name is not null then
    select id
    into v_business_id
    from public.good_deal_businesses
    where slug = v_business_slug
    limit 1;

    if v_business_id is null then
      insert into public.good_deal_businesses (
        name,
        slug,
        commune,
        website_url,
        category,
        is_verified,
        is_active,
        updated_at
      )
      values (
        v_business_name,
        v_business_slug,
        v_candidate.commune,
        v_candidate.source_url,
        v_category,
        true,
        true,
        v_now
      )
      returning id into v_business_id;
    else
      update public.good_deal_businesses
      set
        name = v_business_name,
        commune = v_candidate.commune,
        website_url = v_candidate.source_url,
        category = v_category,
        is_verified = true,
        is_active = true,
        updated_at = v_now
      where id = v_business_id;
    end if;
  end if;

  if v_candidate.content_kind = 'promotion' and nullif(btrim(coalesce(v_candidate.retailer_slug, '')), '') is not null then
    select id
    into v_store_location_id
    from public.shopping_store_locations
    where retailer_slug is not distinct from v_candidate.retailer_slug
      and store_name is not distinct from coalesce(v_candidate.business_name, v_candidate.retailer_slug)
      and commune is not distinct from v_candidate.commune
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
        v_candidate.business_name,
        coalesce(v_candidate.business_name, v_candidate.retailer_slug),
        v_candidate.commune,
        v_candidate.locality,
        v_candidate.source_url,
        true,
        v_now
      )
      returning id into v_store_location_id;
    else
      update public.shopping_store_locations
      set
        retailer_name = v_candidate.business_name,
        locality = v_candidate.locality,
        website_url = v_candidate.source_url,
        is_active = true,
        updated_at = v_now
      where id = v_store_location_id;
    end if;
  end if;

  if v_product_promotion_candidate then
    select id
    into v_product_id
    from public.shopping_products
    where normalized_name is not distinct from v_candidate.normalized_product_name
      and brand is not distinct from v_candidate.brand
      and size_label is not distinct from v_candidate.size_label
    limit 1;

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
        v_candidate.size_label,
        v_category,
        true,
        v_now
      )
      returning id into v_product_id;
    else
      update public.shopping_products
      set
        display_name = v_candidate.product_name,
        category = v_category,
        is_active = true,
        updated_at = v_now
      where id = v_product_id;
    end if;

    if v_product_id is not null and v_product_alias is not null then
      perform 1
      from public.shopping_product_aliases
      where product_id is not distinct from v_product_id
        and normalized_alias is not distinct from v_product_alias
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
          v_product_alias,
          'collector',
          v_candidate.retailer_slug,
          least(greatest(coalesce(v_candidate.confidence_score, 0)::numeric / 100, 0), 1)
        );
      end if;
    end if;
  end if;

  if v_catalog_candidate or v_product_promotion_candidate then
    select id
    into v_catalog_id
    from public.shopping_catalogs
    where collector_source_slug = v_source.slug
      and external_key = v_catalog_external_key
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
        v_catalog_external_key,
        v_source.slug,
        v_candidate.retailer_slug,
        v_candidate.business_name,
        v_candidate.title,
        v_candidate.description,
        v_catalog_scope_type,
        v_candidate.commune,
        v_candidate.micro_region,
        v_store_location_id,
        v_candidate.starts_at,
        v_candidate.ends_at,
        v_candidate.source_url,
        'collector',
        v_catalog_verification_status,
        false,
        true,
        v_now
      )
      returning id into v_catalog_id;
    else
      update public.shopping_catalogs
      set
        retailer_slug = v_candidate.retailer_slug,
        retailer_name = v_candidate.business_name,
        title = v_candidate.title,
        description = v_candidate.description,
        scope_type = v_catalog_scope_type,
        commune = v_candidate.commune,
        micro_region = v_candidate.micro_region,
        store_location_id = v_store_location_id,
        starts_at = v_candidate.starts_at,
        ends_at = v_candidate.ends_at,
        source_url = v_candidate.source_url,
        source_kind = 'collector',
        verification_status = v_catalog_verification_status,
        is_featured = false,
        is_active = true,
        updated_at = v_now
      where id = v_catalog_id;
    end if;
  end if;

  if v_product_promotion_candidate then
    select id
    into v_good_deal_id
    from public.shopping_promotions
    where collector_source_slug = v_source.slug
      and external_key = v_candidate.external_key
    limit 1;

    if v_good_deal_id is null then
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
        v_candidate.external_key,
        v_source.slug,
        v_catalog_id,
        v_product_id,
        v_store_location_id,
        v_candidate.retailer_slug,
        v_candidate.title,
        v_candidate.description,
        v_candidate.promo_price,
        v_candidate.original_price,
        v_candidate.discount_percent,
        v_candidate.unit_price,
        v_candidate.unit_label,
        v_candidate.price_note,
        v_candidate.starts_at,
        v_candidate.ends_at,
        v_candidate.source_url,
        v_candidate.source_page,
        v_promotion_verification_status,
        false,
        true,
        v_now
      )
      returning id into v_good_deal_id;
    else
      update public.shopping_promotions
      set
        catalog_id = v_catalog_id,
        product_id = v_product_id,
        store_location_id = v_store_location_id,
        retailer_slug = v_candidate.retailer_slug,
        title = v_candidate.title,
        offer_text = v_candidate.description,
        promo_price = v_candidate.promo_price,
        original_price = v_candidate.original_price,
        discount_percent = v_candidate.discount_percent,
        unit_price = v_candidate.unit_price,
        unit_label = v_candidate.unit_label,
        conditions = v_candidate.price_note,
        starts_at = v_candidate.starts_at,
        ends_at = v_candidate.ends_at,
        source_url = v_candidate.source_url,
        source_page = v_candidate.source_page,
        verification_status = v_promotion_verification_status,
        is_featured = false,
        is_active = true,
        updated_at = v_now
      where id = v_good_deal_id;
    end if;
  end if;

  select id
  into v_good_deal_id
  from public.good_deals
  where collector_source_slug = v_source.slug
    and external_key = v_candidate.external_key
  limit 1;

  if v_good_deal_id is null then
    insert into public.good_deals (
      external_key,
      collector_source_slug,
      collector_candidate_external_key,
      business_id,
      title,
      description,
      conditions,
      category,
      scope_type,
      commune,
      micro_region,
      starts_at,
      ends_at,
      source_url,
      verification_status,
      deal_type,
      tags,
      is_free,
      price_note,
      content_kind,
      locality,
      territory_name,
      availability_status,
      last_verified_at,
      source_still_available,
      next_check_at,
      is_active,
      updated_at
    )
    values (
      v_candidate.external_key,
      v_source.slug,
      v_candidate.external_key,
      v_business_id,
      v_candidate.title,
      v_candidate.description,
      v_candidate.price_note,
      v_category,
      v_good_deal_scope_type,
      v_candidate.commune,
      v_candidate.micro_region,
      v_candidate.starts_at,
      v_candidate.ends_at,
      v_candidate.source_url,
      v_good_deal_verification_status,
      v_good_deal_deal_type,
      coalesce(v_candidate.tags, '{}'::text[]),
      v_candidate.is_free,
      v_candidate.price_note,
      v_good_deal_content_kind,
      v_candidate.locality,
      v_candidate.territory_name,
      v_good_deal_availability_status,
      coalesce(v_candidate.detected_at, v_now),
      true,
      case
        when v_candidate.content_kind = 'permanent_leisure' then null
        else v_candidate.ends_at
      end,
      true,
      v_now
    )
    returning id into v_good_deal_id;
  else
    update public.good_deals
    set
      collector_candidate_external_key = v_candidate.external_key,
      business_id = v_business_id,
      title = v_candidate.title,
      description = v_candidate.description,
      conditions = v_candidate.price_note,
      category = v_category,
      scope_type = v_good_deal_scope_type,
      commune = v_candidate.commune,
      micro_region = v_candidate.micro_region,
      starts_at = v_candidate.starts_at,
      ends_at = v_candidate.ends_at,
      source_url = v_candidate.source_url,
      verification_status = v_good_deal_verification_status,
      deal_type = v_good_deal_deal_type,
      tags = coalesce(v_candidate.tags, '{}'::text[]),
      is_free = v_candidate.is_free,
      price_note = v_candidate.price_note,
      content_kind = v_good_deal_content_kind,
      locality = v_candidate.locality,
      territory_name = v_candidate.territory_name,
      availability_status = v_good_deal_availability_status,
      last_verified_at = coalesce(v_candidate.detected_at, v_now),
      source_still_available = true,
      next_check_at = case
        when v_candidate.content_kind = 'permanent_leisure' then null
        else v_candidate.ends_at
      end,
      is_active = true,
      updated_at = v_now
    where id = v_good_deal_id;
  end if;

  update public.good_deal_candidates
  set
    status = 'published',
    published_good_deal_id = v_good_deal_id,
    published_at = v_now,
    reviewed_by = coalesce(v_reviewer, reviewed_by),
    reviewed_at = v_now,
    rejected_at = null,
    rejection_reason = null,
    updated_at = v_now
  where id = v_candidate.id;

  return v_good_deal_id;
end;
$$;

alter function public.good_deals_publish_candidate(uuid) owner to postgres;

revoke all on function public.good_deals_publish_candidate(uuid) from public, anon;
grant execute on function public.good_deals_publish_candidate(uuid) to authenticated, service_role, postgres;

commit;
