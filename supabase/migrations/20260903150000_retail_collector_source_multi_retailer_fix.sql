-- BudgetKazPei
-- Correctif collector_source_slug retail multi-enseignes
-- 2026-09-03
--
-- Corrige :
-- 1) le hardcode 'leader-price-reunion-retail' dans la publication active ;
-- 2) le hardcode identique dans le fallback des promotions expirées ;
-- 3) le filtre mono-source de published_good_deals ;
-- 4) les 2 catalogues + 4 promotions Carrefour déjà contaminés.
--
-- Le correctif conserve le slug historique Leader Price pour Leader Price,
-- et introduit des slugs propres pour Carrefour et E.Leclerc.

begin;

create or replace function public.retail_collector_source_slug(
  p_source_type text,
  p_retailer_slug text
)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when nullif(trim(coalesce(p_source_type, '')), '') = 'leader_drive_html'
      then 'leader-price-reunion-retail'
    when nullif(trim(coalesce(p_source_type, '')), '') = 'carrefour_reunion_ssr_html'
      then 'carrefour-reunion-retail'
    when nullif(trim(coalesce(p_source_type, '')), '') = 'eleclerc_reunion_drive_ssr_html'
      then 'eleclerc-reunion-retail'
    when nullif(trim(coalesce(p_retailer_slug, '')), '') is not null
      then trim(both '-' from regexp_replace(lower(trim(p_retailer_slug)), '[^a-z0-9]+', '-', 'g')) || '-retail'
    else null
  end
$$;

comment on function public.retail_collector_source_slug(text, text) is
  'Retourne le collector_source_slug retail à partir de la source technique et, en fallback, du retailer.';

-- ---------------------------------------------------------------------------
-- Préflight : aucun doublon ne doit déjà exister sous le nouveau slug Carrefour.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.shopping_catalogs bad
    join public.shopping_catalogs good
      on good.external_key = bad.external_key
     and good.id <> bad.id
     and good.collector_source_slug = 'carrefour-reunion-retail'
    where bad.collector_source_slug = 'leader-price-reunion-retail'
      and bad.retailer_slug in (
        'carrefour-reunion',
        'carrefour-market-reunion',
        'carrefour-city-reunion'
      )
  ) then
    raise exception 'collector source repair aborted: duplicate Carrefour shopping_catalogs external_key';
  end if;

  if exists (
    select 1
    from public.shopping_promotions bad
    join public.shopping_promotions good
      on good.external_key = bad.external_key
     and good.id <> bad.id
     and good.collector_source_slug = 'carrefour-reunion-retail'
    where bad.collector_source_slug = 'leader-price-reunion-retail'
      and bad.retailer_slug in (
        'carrefour-reunion',
        'carrefour-market-reunion',
        'carrefour-city-reunion'
      )
  ) then
    raise exception 'collector source repair aborted: duplicate Carrefour shopping_promotions external_key';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Publication active :
-- on conserve la fonction actuelle et on remplace uniquement la constante
-- Leader Price par la résolution multi-enseignes.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.retail_publish_promotion_candidates_active(uuid[])'::regprocedure
  )
  into v_def;

  if v_def is null then
    raise exception 'retail_publish_promotion_candidates_active(uuid[]) not found';
  end if;

  if position('leader-price-reunion-retail' in v_def) = 0 then
    raise exception 'active promotion publisher no longer contains the expected legacy hardcode';
  end if;

  v_patched := replace(
    v_def,
    '''leader-price-reunion-retail''',
    'public.retail_collector_source_slug(v_candidate.source_type, v_candidate.retailer_slug)'
  );

  execute v_patched;
end
$$;

-- ---------------------------------------------------------------------------
-- Wrapper promotion :
-- le fallback "promotion expirée -> prix observé" ne doit plus chercher
-- uniquement une promotion Leader Price.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.retail_publish_promotion_candidates(uuid[])'::regprocedure
  )
  into v_def;

  if v_def is null then
    raise exception 'retail_publish_promotion_candidates(uuid[]) not found';
  end if;

  if position('leader-price-reunion-retail' in v_def) = 0 then
    raise exception 'promotion wrapper no longer contains the expected legacy hardcode';
  end if;

  v_patched := replace(
    v_def,
    '''leader-price-reunion-retail''',
    'public.retail_collector_source_slug(v_candidate.source_type, v_candidate.retailer_slug)'
  );

  execute v_patched;
end
$$;

-- ---------------------------------------------------------------------------
-- Vue publique :
-- le flux retail ne doit plus être limité au seul collector Leader Price.
-- On garde le contrat actuel de la vue et on remplace seulement son filtre.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_patched text;
begin
  select pg_get_viewdef('public.published_good_deals'::regclass, true)
  into v_def;

  if v_def is null then
    raise exception 'published_good_deals view not found';
  end if;

  if position('leader-price-reunion-retail' in v_def) = 0 then
    raise exception 'published_good_deals no longer contains the expected legacy hardcode';
  end if;

  v_patched := replace(
    v_def,
    '''leader-price-reunion-retail''',
    'public.retail_collector_source_slug(retail_candidates.source_type, retail_candidates.retailer_slug)'
  );

  execute 'create or replace view public.published_good_deals as ' || v_patched;
end
$$;

-- ---------------------------------------------------------------------------
-- Réparation des données déjà publiées :
-- résultat confirmé : 2 catalogues + 4 promotions Carrefour.
-- ---------------------------------------------------------------------------

update public.shopping_catalogs
set
  collector_source_slug = 'carrefour-reunion-retail',
  updated_at = now()
where collector_source_slug = 'leader-price-reunion-retail'
  and retailer_slug in (
    'carrefour-reunion',
    'carrefour-market-reunion',
    'carrefour-city-reunion'
  );

update public.shopping_promotions
set
  collector_source_slug = 'carrefour-reunion-retail',
  updated_at = now()
where collector_source_slug = 'leader-price-reunion-retail'
  and retailer_slug in (
    'carrefour-reunion',
    'carrefour-market-reunion',
    'carrefour-city-reunion'
  );

-- ---------------------------------------------------------------------------
-- Garde-fous finaux.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.shopping_catalogs
    where collector_source_slug = 'leader-price-reunion-retail'
      and retailer_slug <> 'leader-price-reunion'
  ) then
    raise exception 'collector source repair failed: non-Leader catalogue still tagged as Leader Price';
  end if;

  if exists (
    select 1
    from public.shopping_promotions
    where collector_source_slug = 'leader-price-reunion-retail'
      and retailer_slug <> 'leader-price-reunion'
  ) then
    raise exception 'collector source repair failed: non-Leader promotion still tagged as Leader Price';
  end if;

  if exists (
    select 1
    from public.shopping_promotions p
    join public.retail_price_candidates c
      on c.published_promotion_id = p.id
    where c.status = 'published'
      and c.price_type = 'promotion'
      and p.collector_source_slug is distinct from
          public.retail_collector_source_slug(c.source_type, c.retailer_slug)
  ) then
    raise exception 'collector source repair failed: published retail promotion source mismatch';
  end if;
end
$$;

comment on view public.published_good_deals is
  'Vue publique réunissant les bons plans publiés ainsi que les promotions et prix observés retail publiés via le flux admin multi-enseignes.';

commit;

-- Contrôle conseillé après application :
--
-- select
--   retailer_slug,
--   collector_source_slug,
--   count(*) as nombre
-- from public.shopping_promotions
-- where external_key like 'retail-promo:%'
-- group by retailer_slug, collector_source_slug
-- order by retailer_slug, collector_source_slug;
