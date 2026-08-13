-- Run manually only after the migration and Edge Function have been deployed,
-- and only after the dry-run count has been reviewed.
-- Required Vault secrets:
--   project_url                    e.g. https://PROJECT_REF.supabase.co
--   receipt_image_retention_secret the same random value configured on the Edge Function

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'receipt-image-retention-every-5-minutes',
  'receipt-image-retention-every-minute'
);

select cron.schedule(
  'receipt-image-retention-every-5-minutes',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
      ) || '/functions/v1/receipt-image-retention',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-retention-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'receipt_image_retention_secret'
        )
      ),
      body := '{"dryRun":false}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);
