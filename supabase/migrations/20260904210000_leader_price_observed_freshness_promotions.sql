-- BudgetKazPei
-- Leader Price / Leader Drive : promotions observees sans periode officielle.
--
-- Principes :
--   * aucune date promotionnelle officielle n'est inventee ;
--   * shopping_catalogs reste strictement date ;
--   * une promotion Leader Drive sans dates n'est rattachee a aucun catalogue ;
--   * starts_at / ends_at peuvent etre NULL uniquement pour ce cas strict ;
--   * observed_at et fresh_until portent la fraicheur technique (36 h) ;
--   * Carrefour et les catalogues dates conservent leur fonctionnement historique.

do $budgetkazpei_precheck$
begin
  if to_regclass('public.shopping_promotions') is null then
    raise exception 'shopping_promotions table is required';
  end if;

  if to_regclass('public.shopping_catalogs') is null then
    raise exception 'shopping_catalogs table is required';
  end if;

  if to_regclass('public.retail_price_candidates') is null then
    raise exception 'retail_price_candidates table is required';
  end if;

  if to_regprocedure('public.retail_publish_promotion_candidates(uuid[])') is null then
    raise exception 'retail_publish_promotion_candidates(uuid[]) is required';
  end if;

  if to_regprocedure('public.retail_publish_promotion_candidates_active(uuid[])') is null then
    raise exception 'retail_publish_promotion_candidates_active(uuid[]) is required';
  end if;

  if to_regprocedure('public.retail_auto_publish_safe_promotions(text,uuid,integer)') is null then
    raise exception 'retail_auto_publish_safe_promotions(text,uuid,integer) is required';
  end if;
end;
$budgetkazpei_precheck$;


-- ---------------------------------------------------------------------------
-- 1. Modele de donnees : dates officielles vs fraicheur d'observation
-- ---------------------------------------------------------------------------

alter table public.shopping_promotions
  alter column starts_at drop not null,
  alter column ends_at drop not null;

alter table public.shopping_promotions
  add column if not exists observed_at timestamp with time zone,
  add column if not exists fresh_until timestamp with time zone,
  add column if not exists date_basis text not null default 'official';

update public.shopping_promotions
set date_basis = 'official'
where date_basis is null;

alter table public.shopping_promotions
  drop constraint if exists shopping_promotions_date_basis_check;

alter table public.shopping_promotions
  add constraint shopping_promotions_date_basis_check
  check (
    (
      date_basis = 'official'
      and starts_at is not null
      and ends_at is not null
      and observed_at is null
      and fresh_until is null
      and ends_at >= starts_at
    )
    or
    (
      date_basis = 'observed_freshness'
      and starts_at is null
      and ends_at is null
      and observed_at is not null
      and fresh_until is not null
      and fresh_until > observed_at
      and collector_source_slug = 'leader-price-reunion-retail'
      and catalog_id is null
    )
  );

create index if not exists shopping_promotions_observed_freshness_idx
  on public.shopping_promotions (fresh_until)
  where date_basis = 'observed_freshness';

create index if not exists shopping_promotions_observed_product_idx
  on public.shopping_promotions (retailer_slug, product_id, store_location_id, observed_at desc)
  where date_basis = 'observed_freshness';


-- ---------------------------------------------------------------------------
-- 2. Garde-fou avant ecriture de shopping_promotions
-- ---------------------------------------------------------------------------

create or replace function public.shopping_promotions_enforce_date_basis()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $budgetkazpei_trigger$
declare
  v_candidate_id_text text;
  v_candidate public.retail_price_candidates%rowtype;
begin
  -- Les desactivations techniques doivent toujours rester possibles, meme
  -- lorsque l'observation a depasse 36 h.
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

  -- Cas historique : vraie periode connue.
  if new.starts_at is not null and new.ends_at is not null then
    if new.ends_at < new.starts_at then
      raise exception 'shopping promotion ends_at cannot be before starts_at';
    end if;

    new.date_basis := 'official';
    new.observed_at := null;
    new.fresh_until := null;
    return new;
  end if;

  -- Une seule date presente est toujours incoherente.
  if (new.starts_at is null) <> (new.ends_at is null) then
    raise exception 'shopping promotion requires both starts_at and ends_at, or neither for approved Leader Drive freshness mode';
  end if;

  -- Seul Leader Price / Leader Drive peut publier sans dates officielles.
  if new.collector_source_slug is distinct from 'leader-price-reunion-retail' then
    raise exception 'undated shopping promotions are restricted to leader-price-reunion-retail';
  end if;

  if new.external_key is null
     or new.external_key !~ '^retail-promo:[0-9a-fA-F-]{36}$' then
    raise exception 'undated Leader Price promotion requires a retail-promo candidate external_key';
  end if;

  v_candidate_id_text := substring(
    new.external_key
    from length('retail-promo:') + 1
  );

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

  if v_candidate.source_observed_at is null
     or v_candidate.source_observed_at < now() - interval '36 hours' then
    raise exception 'undated Leader Price promotion observation is older than 36 hours';
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
  new.fresh_until := v_candidate.source_observed_at + interval '36 hours';
  new.date_basis := 'observed_freshness';
  new.is_active := new.fresh_until > now();

  return new;
end;
$budgetkazpei_trigger$;

alter function public.shopping_promotions_enforce_date_basis() owner to postgres;
revoke all on function public.shopping_promotions_enforce_date_basis() from public, anon, authenticated;

drop trigger if exists shopping_promotions_enforce_date_basis_trigger
  on public.shopping_promotions;

create trigger shopping_promotions_enforce_date_basis_trigger
before insert or update on public.shopping_promotions
for each row
execute function public.shopping_promotions_enforce_date_basis();


-- ---------------------------------------------------------------------------
-- 3. Une nouvelle observation remplace l'ancienne pour le meme produit
-- ---------------------------------------------------------------------------

create or replace function public.shopping_promotions_deactivate_older_observed()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $budgetkazpei_after$
begin
  if new.date_basis = 'observed_freshness'
     and new.is_active is true
     and new.product_id is not null then
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
      and older.observed_at <= new.observed_at;
  end if;

  return null;
end;
$budgetkazpei_after$;

alter function public.shopping_promotions_deactivate_older_observed() owner to postgres;
revoke all on function public.shopping_promotions_deactivate_older_observed() from public, anon, authenticated;

drop trigger if exists shopping_promotions_deactivate_older_observed_trigger
  on public.shopping_promotions;

create trigger shopping_promotions_deactivate_older_observed_trigger
after insert or update on public.shopping_promotions
for each row
execute function public.shopping_promotions_deactivate_older_observed();


-- ---------------------------------------------------------------------------
-- 4. Expiration technique des observations depassees
-- ---------------------------------------------------------------------------

create or replace function public.retail_expire_stale_observed_promotions()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $budgetkazpei_expire$
declare
  v_count integer := 0;
begin
  update public.shopping_promotions
  set
    is_active = false,
    updated_at = now()
  where date_basis = 'observed_freshness'
    and is_active is true
    and fresh_until <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$budgetkazpei_expire$;

alter function public.retail_expire_stale_observed_promotions() owner to postgres;
revoke all on function public.retail_expire_stale_observed_promotions() from public, anon, authenticated;
grant execute on function public.retail_expire_stale_observed_promotions() to postgres, service_role;


create or replace function public.retail_expire_stale_observed_promotions_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $budgetkazpei_expire_trigger$
begin
  perform public.retail_expire_stale_observed_promotions();
  return null;
end;
$budgetkazpei_expire_trigger$;

alter function public.retail_expire_stale_observed_promotions_trigger() owner to postgres;
revoke all on function public.retail_expire_stale_observed_promotions_trigger() from public, anon, authenticated;

drop trigger if exists retail_candidates_expire_stale_observed_promotions_trigger
  on public.retail_price_candidates;

create trigger retail_candidates_expire_stale_observed_promotions_trigger
after insert or update on public.retail_price_candidates
for each statement
execute function public.retail_expire_stale_observed_promotions_trigger();


-- ---------------------------------------------------------------------------
-- 5. Adaptation ciblee du publisher actif :
--    un Leader Drive sans dates ne cree PAS de shopping_catalogs.
--    Tout le reste de la fonction actuellement installee est preserve.
-- ---------------------------------------------------------------------------

do $budgetkazpei_patch$
declare
  v_proc regprocedure :=
    to_regprocedure('public.retail_publish_promotion_candidates_active(uuid[])');
  v_definition text;
  v_observed_marker text :=
    E'    v_observed_at_day := to_char(v_candidate.source_observed_at at time zone ''UTC'', ''YYYY-MM-DD'');\n';
  v_promotion_marker text :=
    E'    select id\n    into v_promotion_id\n    from public.shopping_promotions';
  v_patch_marker text :=
    '-- BudgetKazPei observed_freshness: Leader Drive sans periode ne cree pas de shopping_catalogs.';
  v_observed_pos integer;
  v_promotion_pos integer;
  v_catalog_start integer;
  v_prefix text;
  v_catalog_block text;
  v_suffix text;
begin
  if v_proc is null then
    raise exception 'retail_publish_promotion_candidates_active(uuid[]) is required';
  end if;

  select pg_get_functiondef(v_proc)
  into v_definition;

  if position(v_patch_marker in v_definition) > 0 then
    raise notice 'BudgetKazPei observed_freshness catalog bypass already installed';
    return;
  end if;

  v_observed_pos := position(v_observed_marker in v_definition);
  v_promotion_pos := position(v_promotion_marker in v_definition);

  if v_observed_pos = 0 then
    raise exception 'Observed-at marker not found in current active promotion publisher';
  end if;

  if v_promotion_pos = 0 then
    raise exception 'Promotion lookup marker not found in current active promotion publisher';
  end if;

  v_catalog_start := v_observed_pos + length(v_observed_marker);

  if v_promotion_pos <= v_catalog_start then
    raise exception 'Unexpected active publisher structure: promotion lookup precedes catalog block';
  end if;

  v_prefix := substring(v_definition from 1 for v_catalog_start - 1);
  v_catalog_block := substring(
    v_definition
    from v_catalog_start
    for v_promotion_pos - v_catalog_start
  );
  v_suffix := substring(v_definition from v_promotion_pos);

  v_definition :=
    v_prefix
    || E'    -- BudgetKazPei observed_freshness: Leader Drive sans periode ne cree pas de shopping_catalogs.\n'
    || E'    if v_candidate.retailer_slug = ''leader-price-reunion''\n'
    || E'       and v_candidate.source_type = ''leader_drive_html''\n'
    || E'       and v_candidate.starts_at is null\n'
    || E'       and v_candidate.ends_at is null then\n'
    || E'      v_catalog_id := null;\n'
    || E'    else\n'
    || v_catalog_block
    || E'    end if;\n\n'
    || v_suffix;

  execute v_definition;

  select pg_get_functiondef(v_proc)
  into v_definition;

  if position(v_patch_marker in v_definition) = 0 then
    raise exception 'Observed freshness catalog bypass verification failed';
  end if;

  raise notice 'BudgetKazPei active promotion publisher now bypasses shopping_catalogs only for undated Leader Drive promotions';
end;
$budgetkazpei_patch$;


-- ---------------------------------------------------------------------------
-- 6. Rattrapage securise.
--    1) traite les nouveaux needs_review eligibles ;
--    2) retente les approved_promotion precedemment bloques par shopping_catalogs.
-- ---------------------------------------------------------------------------

do $budgetkazpei_catchup$
declare
  v_safe_result jsonb;
  v_retry_result jsonb;
  v_candidate_ids uuid[];
begin
  perform public.retail_expire_stale_observed_promotions();

  v_safe_result := public.retail_auto_publish_safe_promotions(
    'leader-price-reunion',
    null,
    500
  );

  raise notice 'BudgetKazPei Leader Price safe auto publication after observed_freshness migration: %',
    v_safe_result;

  select array_agg(id order by source_observed_at desc)
  into v_candidate_ids
  from (
    select id, source_observed_at
    from public.retail_price_candidates
    where retailer_slug = 'leader-price-reunion'
      and source_type = 'leader_drive_html'
      and status = 'approved_promotion'
      and starts_at is null
      and ends_at is null
      and source_observed_at is not null
      and source_observed_at >= now() - interval '36 hours'
      and promotion_proven is true
      and promotion_evidence is not null
      and current_price is not null
      and current_price > 0
      and original_price is not null
      and original_price > current_price
      and coalesce(validation_errors, '[]'::jsonb) = '[]'::jsonb
      and coalesce(match_warnings, '[]'::jsonb)
            <@ '["matching_backend_unavailable_in_local_session"]'::jsonb
    order by source_observed_at desc
    limit 500
  ) eligible;

  if v_candidate_ids is not null
     and array_length(v_candidate_ids, 1) is not null then
    v_retry_result :=
      public.retail_publish_promotion_candidates(v_candidate_ids);

    raise notice 'BudgetKazPei Leader Price approved-promotion retry after observed_freshness migration: %',
      v_retry_result;
  else
    raise notice 'BudgetKazPei Leader Price approved-promotion retry: no eligible candidate';
  end if;

  perform public.retail_expire_stale_observed_promotions();
end;
$budgetkazpei_catchup$;


-- ---------------------------------------------------------------------------
-- 7. Controles finaux : echec ferme si une incoherence est introduite.
-- ---------------------------------------------------------------------------

do $budgetkazpei_verify$
declare
  v_invalid_observed integer;
  v_wrong_retailer integer;
  v_stale_active integer;
  v_duplicate_active integer;
  v_fresh_unpublished integer;
  v_current_published integer;
begin
  select count(*)
  into v_invalid_observed
  from public.shopping_promotions
  where date_basis = 'observed_freshness'
    and (
      collector_source_slug is distinct from 'leader-price-reunion-retail'
      or catalog_id is not null
      or starts_at is not null
      or ends_at is not null
      or observed_at is null
      or fresh_until is null
      or fresh_until <= observed_at
    );

  if v_invalid_observed <> 0 then
    raise exception 'Observed freshness validation failed: % invalid row(s)', v_invalid_observed;
  end if;

  select count(*)
  into v_wrong_retailer
  from public.shopping_promotions
  where date_basis = 'observed_freshness'
    and retailer_slug is distinct from 'leader-price-reunion';

  if v_wrong_retailer <> 0 then
    raise exception 'Observed freshness leaked to non-Leader retailer: % row(s)', v_wrong_retailer;
  end if;

  select count(*)
  into v_stale_active
  from public.shopping_promotions
  where date_basis = 'observed_freshness'
    and is_active is true
    and fresh_until <= now();

  if v_stale_active <> 0 then
    raise exception 'Stale observed promotion remains active: % row(s)', v_stale_active;
  end if;

  select count(*)
  into v_duplicate_active
  from (
    select retailer_slug, product_id, store_location_id
    from public.shopping_promotions
    where date_basis = 'observed_freshness'
      and is_active is true
      and product_id is not null
    group by retailer_slug, product_id, store_location_id
    having count(*) > 1
  ) duplicated;

  if v_duplicate_active <> 0 then
    raise exception 'Multiple active observed promotions exist for the same product/store: % group(s)',
      v_duplicate_active;
  end if;

  select count(*)
  into v_fresh_unpublished
  from public.retail_price_candidates c
  where c.retailer_slug = 'leader-price-reunion'
    and c.source_type = 'leader_drive_html'
    and c.status = 'approved_promotion'
    and c.starts_at is null
    and c.ends_at is null
    and c.source_observed_at >= now() - interval '36 hours'
    and c.promotion_proven is true
    and c.promotion_evidence is not null
    and c.current_price > 0
    and c.original_price > c.current_price
    and coalesce(c.validation_errors, '[]'::jsonb) = '[]'::jsonb
    and coalesce(c.match_warnings, '[]'::jsonb)
          <@ '["matching_backend_unavailable_in_local_session"]'::jsonb
    and c.published_promotion_id is null;

  if v_fresh_unpublished <> 0 then
    raise exception 'Fresh safe Leader Price promotions remain unpublished after catch-up: % candidate(s)',
      v_fresh_unpublished;
  end if;

  select count(*)
  into v_current_published
  from public.shopping_promotions
  where collector_source_slug = 'leader-price-reunion-retail'
    and date_basis = 'observed_freshness'
    and is_active is true
    and fresh_until > now();

  raise notice 'BudgetKazPei observed_freshness verification OK: % active fresh Leader Price promotion(s)',
    v_current_published;
end;
$budgetkazpei_verify$;