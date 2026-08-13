-- Receipt originals are personal data with a strict seven-day lifetime.
-- This migration never deletes receipts, receipt_items, transactions or market data.

alter table public.receipts
  add column if not exists image_paths text[] not null default '{}'::text[];

alter table public.receipts
  add column if not exists image_expires_at timestamptz;

create or replace function public.receipt_normalize_storage_path(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(coalesce(p_value, '')), '') is null then null
    when lower(btrim(p_value)) like 'data:%' then null
    when btrim(p_value) like '%/receipt-images/%'
      then nullif(split_part(split_part(btrim(p_value), '/receipt-images/', 2), '?', 1), '')
    when btrim(p_value) ~* '^https?://' then null
    else nullif(btrim(btrim(p_value), '/'), '')
  end
$$;

create or replace function public.receipt_collect_storage_paths(
  p_image_paths text[],
  p_image_path text,
  p_storage_path text,
  p_image_url text
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct normalized_path order by normalized_path), '{}'::text[])
  from (
    select public.receipt_normalize_storage_path(raw_path) as normalized_path
    from unnest(
      coalesce(p_image_paths, '{}'::text[])
      || array[p_image_path, p_storage_path, p_image_url]
    ) as paths(raw_path)
  ) normalized
  where normalized_path is not null
$$;

create or replace function public.receipt_collect_owned_storage_paths(
  p_user_id uuid,
  p_image_paths text[],
  p_image_path text,
  p_storage_path text,
  p_image_url text
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(path order by path), '{}'::text[])
  from unnest(public.receipt_collect_storage_paths(
    p_image_paths,
    p_image_path,
    p_storage_path,
    p_image_url
  )) as owned_paths(path)
  where split_part(path, '/', 1) = p_user_id::text
$$;

update public.receipts as receipts
set image_paths = public.receipt_collect_owned_storage_paths(
  receipts.user_id,
  receipts.image_paths,
  receipts.image_path,
  receipts.storage_path,
  receipts.image_url
)
where receipts.image_path is not null
   or receipts.storage_path is not null
   or receipts.image_url is not null
   or cardinality(receipts.image_paths) > 0;

update public.receipts as receipts
set image_expires_at = (
    select min(objects.created_at)
    from storage.objects as objects
    where objects.bucket_id = 'receipt-images'
      and objects.name = any(receipts.image_paths)
  ) + interval '7 days'
where receipts.image_expires_at is null
  and cardinality(receipts.image_paths) > 0
  and exists (
    select 1
    from storage.objects as objects
    where objects.bucket_id = 'receipt-images'
      and objects.name = any(receipts.image_paths)
  );

-- Inline legacy images have no Storage object. Their separate fallback is based
-- on database creation time, never on the purchase date printed on the receipt.
update public.receipts as receipts
set image_expires_at = receipts.created_at + interval '7 days'
where receipts.image_expires_at is null
  and cardinality(receipts.image_paths) = 0
  and receipts.image_url ~* '^data:';

create or replace function public.receipt_set_image_retention_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_uploaded_at timestamptz;
  v_deadline timestamptz;
begin
  v_paths := public.receipt_collect_owned_storage_paths(
    new.user_id,
    new.image_paths,
    new.image_path,
    new.storage_path,
    new.image_url
  );
  new.image_paths := v_paths;

  if cardinality(v_paths) = 0 and new.image_url is null then
    return new;
  end if;

  select min(objects.created_at)
  into v_uploaded_at
  from storage.objects as objects
  where objects.bucket_id = 'receipt-images'
    and objects.name = any(v_paths);

  if cardinality(v_paths) > 0 then
    if v_uploaded_at is null then
      -- A Storage reference without an object cannot be aged safely. Never
      -- substitute purchase_date or another client-controlled receipt date.
      new.image_expires_at := null;
      return new;
    end if;
    v_deadline := v_uploaded_at + interval '7 days';
  else
    -- Only the legacy inline/base64 case lacks storage.objects.created_at.
    v_deadline := coalesce(new.created_at, now()) + interval '7 days';
  end if;

  if tg_op = 'UPDATE' and old.image_expires_at is not null then
    -- A client may shorten a deadline, but can never extend an existing one.
    new.image_expires_at := least(old.image_expires_at, coalesce(new.image_expires_at, v_deadline), v_deadline);
  else
    new.image_expires_at := least(coalesce(new.image_expires_at, v_deadline), v_deadline);
  end if;

  return new;
end
$$;

drop trigger if exists receipts_set_image_retention_deadline on public.receipts;
create trigger receipts_set_image_retention_deadline
before insert or update of image_path, image_paths, storage_path, image_url, image_expires_at
on public.receipts
for each row execute function public.receipt_set_image_retention_deadline();

create index if not exists receipts_image_retention_due_idx
  on public.receipts (image_expires_at, id)
  where image_expires_at is not null
    and image_deleted_at is null;

create or replace function public.receipt_image_remaining_seconds(p_receipt_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when receipts.image_deleted_at is not null then 0
    when cardinality(public.receipt_collect_owned_storage_paths(
      receipts.user_id,
      receipts.image_paths,
      receipts.image_path,
      receipts.storage_path,
      receipts.image_url
    )) = 0 then null
    when receipts.image_expires_at is null then null
    when receipts.image_expires_at <= now() then 0
    else greatest(
      0,
      least(
        600,
        floor(extract(epoch from (receipts.image_expires_at - now())))::integer
      )
    )
  end
  from public.receipts as receipts
  where receipts.id = p_receipt_id
    and receipts.user_id = auth.uid()
$$;

revoke all on function public.receipt_image_remaining_seconds(uuid) from public;
grant execute on function public.receipt_image_remaining_seconds(uuid) to authenticated;

create or replace function public.receipt_image_retention_candidates(
  p_now timestamptz default now(),
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  receipt_id uuid,
  user_id uuid,
  expires_at timestamptz,
  storage_paths text[],
  has_inline_image boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    receipts.id,
    receipts.user_id,
    receipts.image_expires_at,
    public.receipt_collect_owned_storage_paths(
      receipts.user_id,
      receipts.image_paths,
      receipts.image_path,
      receipts.storage_path,
      receipts.image_url
    ),
    coalesce(receipts.image_url ~* '^data:', false)
  from public.receipts as receipts
  where receipts.image_expires_at <= p_now
    and receipts.image_deleted_at is null
    and (
      cardinality(public.receipt_collect_owned_storage_paths(
        receipts.user_id,
        receipts.image_paths,
        receipts.image_path,
        receipts.storage_path,
        receipts.image_url
      )) > 0
      or receipts.image_url is not null
    )
  order by receipts.image_expires_at, receipts.id
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.receipt_finalize_image_retention(
  p_receipt_id uuid,
  p_deleted_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_rows integer := 0;
begin
  update public.receipts
  set image_path = null,
      image_paths = '{}'::text[],
      storage_path = null,
      image_url = null,
      image_deleted_at = coalesce(image_deleted_at, p_deleted_at),
      image_deleted_reason = coalesce(image_deleted_reason, 'automatic_7_days_expiry'),
      updated_at = p_deleted_at
  where id = p_receipt_id
    and image_expires_at <= p_deleted_at;

  get diagnostics v_updated_rows = row_count;
  return v_updated_rows > 0;
end
$$;

create or replace function public.receipt_orphan_image_retention_candidates(
  p_now timestamptz default now(),
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  storage_path text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select objects.name, objects.created_at + interval '7 days'
  from storage.objects as objects
  where objects.bucket_id = 'receipt-images'
    and objects.created_at + interval '7 days' <= p_now
    and not exists (
      select 1
      from public.receipts as receipts
      where objects.name = any(public.receipt_collect_owned_storage_paths(
        receipts.user_id,
        receipts.image_paths,
        receipts.image_path,
        receipts.storage_path,
        receipts.image_url
      ))
    )
  order by objects.created_at, objects.name
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.receipt_image_retention_audit(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with expired_receipts as (
    select
      receipts.id,
      public.receipt_collect_owned_storage_paths(
        receipts.user_id,
        receipts.image_paths,
        receipts.image_path,
        receipts.storage_path,
        receipts.image_url
      ) as paths,
      coalesce(receipts.image_url ~* '^data:', false) as has_inline_image
    from public.receipts as receipts
    where receipts.image_expires_at <= p_now
      and receipts.image_deleted_at is null
      and (
        cardinality(public.receipt_collect_owned_storage_paths(
          receipts.user_id,
          receipts.image_paths,
          receipts.image_path,
          receipts.storage_path,
          receipts.image_url
        )) > 0
        or receipts.image_url is not null
      )
  ),
  distinct_paths as (
    select distinct unnest(expired_receipts.paths) as path
    from expired_receipts
  ),
  tracked_existing_paths as (
    select distinct objects.name
    from storage.objects as objects
    join distinct_paths on distinct_paths.path = objects.name
    where objects.bucket_id = 'receipt-images'
  ),
  orphan_paths as (
    select objects.name
    from storage.objects as objects
    where objects.bucket_id = 'receipt-images'
      and objects.created_at + interval '7 days' <= p_now
      and not exists (select 1 from distinct_paths where distinct_paths.path = objects.name)
      and not exists (
        select 1
        from public.receipts as receipts
        where objects.name = any(public.receipt_collect_owned_storage_paths(
          receipts.user_id,
          receipts.image_paths,
          receipts.image_path,
          receipts.storage_path,
          receipts.image_url
        ))
      )
  )
  select jsonb_build_object(
    'expired_receipts', (select count(*) from expired_receipts),
    'tracked_storage_images', (select count(*) from tracked_existing_paths),
    'missing_storage_references',
      (select count(*) from distinct_paths)
      - (select count(*) from tracked_existing_paths),
    'inline_images', (select count(*) from expired_receipts where has_inline_image),
    'orphan_storage_images', (select count(*) from orphan_paths),
    'total_images',
      (select count(*) from tracked_existing_paths)
      + (select count(*) from expired_receipts where has_inline_image)
      + (select count(*) from orphan_paths)
  )
$$;

revoke all on function public.receipt_image_retention_candidates(timestamptz, integer, integer) from public;
revoke all on function public.receipt_finalize_image_retention(uuid, timestamptz) from public;
revoke all on function public.receipt_orphan_image_retention_candidates(timestamptz, integer, integer) from public;
revoke all on function public.receipt_image_retention_audit(timestamptz) from public;
grant execute on function public.receipt_image_retention_candidates(timestamptz, integer, integer) to service_role;
grant execute on function public.receipt_finalize_image_retention(uuid, timestamptz) to service_role;
grant execute on function public.receipt_orphan_image_retention_candidates(timestamptz, integer, integer) to service_role;
grant execute on function public.receipt_image_retention_audit(timestamptz) to service_role;

-- Even before the asynchronous physical cleanup runs, an expired original can no
-- longer be signed by its owner. The Edge Function also caps signed URL lifetime
-- to the remaining server-side retention window.
drop policy if exists "receipt_images_select_own" on storage.objects;
create policy "receipt_images_select_own"
  on storage.objects for select
  using (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
    and created_at + interval '7 days' > now()
  );
