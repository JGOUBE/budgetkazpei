# Rétention des originaux de tickets

Ce runbook est volontairement séparé de la migration : appliquer la migration ne lance aucune suppression Storage. La politique Storage bloque cependant toute nouvelle URL signée d’un original âgé de sept jours.

## Ordre de mise en production proposé

1. Avant toute migration, exécuter le script en lecture seule `supabase/jobs/audit_receipt_image_retention.sql` dans le SQL editor et présenter `total_historical_images_to_purge`.
2. Appliquer `202608130001_receipt_image_retention.sql`.
3. Déployer `receipt-image-retention` et définir un secret aléatoire dédié :

   ```powershell
   supabase functions deploy receipt-image-retention
   supabase secrets set RECEIPT_IMAGE_RETENTION_SECRET=<SECRET_ALEATOIRE>
   ```

4. Créer dans Vault les secrets `project_url` et `receipt_image_retention_secret`.
5. Confirmer le nombre historique, toujours sans suppression :

   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri "https://<PROJECT_REF>.supabase.co/functions/v1/receipt-image-retention" `
     -Headers @{ "x-retention-secret" = "<SECRET_ALEATOIRE>" } `
     -ContentType "application/json" `
     -Body '{"dryRun":true}'
   ```

   Le résultat distingue `expired_receipts`, `tracked_storage_images`, `inline_images`, `orphan_storage_images` et `total_images`.

6. Présenter et faire valider ce nombre. Ne pas poursuivre avant validation.
7. Pour le rattrapage historique, appeler une fois la fonction avec `{"dryRun":false}`.
8. Planifier ensuite le job `supabase/jobs/schedule_receipt_image_retention.sql` toutes les cinq minutes.

L’accès reste possible jusqu’à l’échéance exacte calculée depuis `storage.objects.created_at`, puis la politique Storage le bloque à J+7. La purge physique ne démarre jamais avant cette échéance et le cron passe toutes les cinq minutes. La purge est idempotente : un objet déjà absent est accepté, une ligne déjà finalisée ne redevient pas candidate, et un échec Storage conserve les références privées pour un retry. Le job ne supprime aucune ligne de `receipts`, `receipt_items`, `transactions` ou des tables marché.
