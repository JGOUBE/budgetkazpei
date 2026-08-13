-- Read-only production audit. This query deletes and updates nothing.
-- It uses storage.objects.created_at as the only clock for Storage images.

with receipt_references as (
  select distinct
    receipts.id as receipt_id,
    paths.storage_path
  from public.receipts as receipts
  cross join lateral unnest(public.receipt_collect_owned_storage_paths(
    receipts.user_id,
    receipts.image_paths,
    receipts.image_path,
    receipts.storage_path,
    receipts.image_url
  )) as paths(storage_path)
),
expired_storage as (
  select
    objects.name,
    objects.created_at,
    objects.created_at + interval '7 days' as expires_at,
    case
      when receipt_references.receipt_id is null then 'orphan_storage'
      else 'tracked_storage'
    end as category
  from storage.objects as objects
  left join receipt_references
    on receipt_references.storage_path = objects.name
  where objects.bucket_id = 'receipt-images'
    and objects.created_at + interval '7 days' <= now()
),
expired_inline_images as (
  select receipts.id
  from public.receipts as receipts
  where receipts.image_url ~* '^data:'
    and receipts.created_at + interval '7 days' <= now()
)
select
  now() as audited_at,
  count(*) filter (where category = 'tracked_storage') as tracked_storage_images,
  count(*) filter (where category = 'orphan_storage') as orphan_storage_images,
  (select count(*) from expired_inline_images) as inline_database_images,
  count(*) + (select count(*) from expired_inline_images) as total_historical_images_to_purge,
  min(created_at) as oldest_expired_image_created_at,
  max(created_at) as newest_expired_image_created_at,
  max(expires_at) as newest_expired_image_expired_at,
  count(*) filter (where expires_at > now()) as non_expired_images_targeted
from expired_storage;
