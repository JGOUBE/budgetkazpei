begin;

do $$
declare
  required_table text;
  required_tables text[] := array[
    'public.profiles',
    'public.good_deals',
    'public.good_deal_businesses',
    'public.good_deal_sources',
    'public.good_deal_source_snapshots',
    'public.good_deal_candidates',
    'public.good_deal_ingestion_runs',
    'public.shopping_catalogs',
    'public.shopping_promotions'
  ];
begin
  foreach required_table in array required_tables loop
    if to_regclass(required_table) is null then
      raise exception 'Migration 202607260001_good_deals_expiration_private_review requires table % to exist before execution.', required_table;
    end if;
  end loop;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_admin'
      and udt_name = 'bool'
  ) then
    raise exception 'Migration 202607260001_good_deals_expiration_private_review requires public.profiles.is_admin boolean to exist.';
  end if;

  if to_regclass('auth.users') is null then
    raise exception 'Migration 202607260001_good_deals_expiration_private_review requires auth.users to exist.';
  end if;
end $$;

alter table public.good_deal_candidates
  add column if not exists reviewed_by uuid null references auth.users(id) on delete set null,
  add column if not exists review_notes text null,
  add column if not exists rejection_reason text null;

create index if not exists good_deals_collector_expiration_idx
  on public.good_deals (collector_source_slug, is_active, ends_at)
  where collector_source_slug is not null;

create index if not exists shopping_catalogs_collector_expiration_idx
  on public.shopping_catalogs (collector_source_slug, is_active, ends_at)
  where collector_source_slug is not null;

create index if not exists shopping_promotions_collector_expiration_idx
  on public.shopping_promotions (collector_source_slug, is_active, ends_at)
  where collector_source_slug is not null;

create index if not exists good_deal_candidates_publication_queue_idx
  on public.good_deal_candidates (status, published_good_deal_id, ends_at, detected_at desc);

create or replace function public.good_deals_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
$$;

alter function public.good_deals_is_admin() owner to postgres;

revoke all on function public.good_deals_is_admin() from public, anon;
grant execute on function public.good_deals_is_admin() to authenticated, service_role, postgres;

create or replace function public.good_deals_protect_profiles_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_existing_admin boolean := public.good_deals_is_admin();
  v_can_manage_admin boolean := session_user = 'postgres'
    or v_role = 'service_role'
    or v_existing_admin;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) and not v_can_manage_admin then
      raise exception 'profiles.is_admin cannot be set to true by a non-admin user'
        using errcode = '42501';
    end if;

    new.is_admin := coalesce(new.is_admin, false);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_admin is distinct from old.is_admin and not v_can_manage_admin then
      raise exception 'profiles.is_admin cannot be modified by a non-admin user'
        using errcode = '42501';
    end if;

    new.is_admin := coalesce(new.is_admin, false);
    return new;
  end if;

  return new;
end;
$$;

alter function public.good_deals_protect_profiles_is_admin() owner to postgres;

revoke all on function public.good_deals_protect_profiles_is_admin() from public, anon, authenticated;
grant execute on function public.good_deals_protect_profiles_is_admin() to postgres, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'profiles_protect_is_admin_trg'
      and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger profiles_protect_is_admin_trg
    before insert or update on public.profiles
    for each row
    execute function public.good_deals_protect_profiles_is_admin();
  end if;
end $$;

-- RLS filters rows, not columns. This trigger blocks any attempt to self-promote is_admin.
drop policy if exists "Users can only see their own profile" on public.profiles;
create policy "Users can only see their own profile"
  on public.profiles
  for select
  to public
  using (auth.uid() = id);

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to public
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to public
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to public
  with check (auth.uid() = id);

create or replace function public.good_deal_candidates_apply_review_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean := public.good_deals_is_admin();
  v_review_change boolean := false;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  new.updated_at := now();
  new.review_notes := nullif(btrim(coalesce(new.review_notes, '')), '');
  new.rejection_reason := nullif(btrim(coalesce(new.rejection_reason, '')), '');

  v_review_change := (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.business_name is distinct from old.business_name
    or new.organizer_name is distinct from old.organizer_name
    or new.commune is distinct from old.commune
    or new.category is distinct from old.category
    or new.source_url is distinct from old.source_url
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.promo_price is distinct from old.promo_price
    or new.original_price is distinct from old.original_price
    or new.status is distinct from old.status
    or new.review_notes is distinct from old.review_notes
    or new.rejection_reason is distinct from old.rejection_reason
  );

  if v_is_admin and v_review_change then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      new.reviewed_at := coalesce(new.reviewed_at, now());
      new.rejected_at := null;
      new.rejection_reason := null;
    elsif new.status = 'rejected' then
      new.rejected_at := now();
    elsif new.status <> 'rejected' then
      new.rejected_at := null;
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'good_deal_candidates_apply_review_audit_trg'
      and tgrelid = 'public.good_deal_candidates'::regclass
  ) then
    create trigger good_deal_candidates_apply_review_audit_trg
    before update on public.good_deal_candidates
    for each row
    execute function public.good_deal_candidates_apply_review_audit();
  end if;
end $$;

-- CREATE OR REPLACE VIEW cannot reorder/rename existing view columns.
-- Recreate the private review view transactionally, without CASCADE.
drop view if exists public.good_deal_candidates_review;

create view public.good_deal_candidates_review
with (security_invoker = true)
as
select
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
  c.published_good_deal_id,
  c.id,
  c.source_id,
  c.snapshot_id,
  c.description,
  c.business_name,
  c.organizer_name,
  c.retailer_slug,
  c.category,
  c.review_notes,
  c.rejection_reason,
  c.reviewed_by,
  c.reviewed_at,
  c.rejected_at,
  c.updated_at
from public.good_deal_candidates c
join public.good_deal_sources s
  on s.id = c.source_id;

create or replace view public.published_good_deals
as
select
  gd.id,
  gd.business_id,
  gd.title,
  gd.description,
  gd.conditions,
  gd.category,
  gd.scope_type,
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
  gd.deal_type,
  gd.tags,
  gd.is_free,
  gd.price_note,
  gd.content_kind,
  gd.locality,
  gd.territory_name,
  gd.opening_hours_note,
  gd.booking_required,
  gd.minimum_age,
  gd.audience,
  gd.availability_status,
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
  and (b.id is null or b.is_active = true);

grant select on table public.good_deal_sources to authenticated;
grant select on table public.good_deal_source_snapshots to authenticated;
grant select on table public.good_deal_ingestion_runs to authenticated;
grant select on table public.good_deal_candidates to authenticated;
grant update (
  title,
  description,
  business_name,
  organizer_name,
  commune,
  category,
  source_url,
  starts_at,
  ends_at,
  promo_price,
  original_price,
  status,
  review_notes,
  rejection_reason
) on table public.good_deal_candidates to authenticated;
revoke all on public.good_deal_candidates_review from public, anon;
grant select on public.good_deal_candidates_review to authenticated, service_role, postgres;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'good_deal_sources'
      and policyname = 'good_deal_sources_admin_select'
  ) then
    create policy good_deal_sources_admin_select
      on public.good_deal_sources
      for select
      to authenticated
      using (public.good_deals_is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'good_deal_source_snapshots'
      and policyname = 'good_deal_source_snapshots_admin_select'
  ) then
    create policy good_deal_source_snapshots_admin_select
      on public.good_deal_source_snapshots
      for select
      to authenticated
      using (public.good_deals_is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'good_deal_ingestion_runs'
      and policyname = 'good_deal_ingestion_runs_admin_select'
  ) then
    create policy good_deal_ingestion_runs_admin_select
      on public.good_deal_ingestion_runs
      for select
      to authenticated
      using (public.good_deals_is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'good_deal_candidates'
      and policyname = 'good_deal_candidates_admin_select'
  ) then
    create policy good_deal_candidates_admin_select
      on public.good_deal_candidates
      for select
      to authenticated
      using (public.good_deals_is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'good_deal_candidates'
      and policyname = 'good_deal_candidates_admin_update'
  ) then
    create policy good_deal_candidates_admin_update
      on public.good_deal_candidates
      for update
      to authenticated
      using (public.good_deals_is_admin())
      with check (public.good_deals_is_admin());
  end if;
end $$;

commit;