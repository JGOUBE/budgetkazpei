# Audit de rétention des images de tickets — 13/08/2026

## Conclusion

L’original affiché dans « Mes tickets » est un objet du bucket privé Supabase Storage `receipt-images`. La ligne `receipts` ne contient pas l’image binaire dans le flux normal : elle conserve son chemin dans `image_path`. `ReceiptsPage` demande ensuite une URL signée de dix minutes et n’affiche le bouton « Voir/Masquer le ticket original » que si cette URL existe.

Le comptage de production a été exécuté avec la requête strictement en lecture seule `supabase/jobs/audit_receipt_image_retention.sql`, le 13/08/2026 à 00:33 (Indian/Mauritius) :

- 5 images Storage expirées encore référencées par un ticket ;
- 66 images Storage expirées orphelines ;
- 0 image inline `data:`/base64 expirée dans `receipts.image_url` ;
- total historique à purger : **71 images**.

Aucune de ces images n’a été supprimée.

## Traçage complet du bouton

1. À la fin du scan, `ReceiptsPage.processCompletedScan` choisit l’image optimisée ou le fichier source et appelle `uploadReceiptImage`.
2. `uploadReceiptImage` écrit le JPEG sous `<user_id>/<uuid>.jpg` dans le bucket privé `receipt-images`.
3. `createReceipt` persiste ce chemin dans `receipts.image_path`.
4. À l’ouverture d’un détail, `ReceiptsPage.openDetail` charge `receipts` et `receipt_items`, puis appelle `getReceiptImageUrl`.
5. `getReceiptImageUrl` crée une URL signée Supabase Storage.
6. `ReceiptDetail` reçoit cette URL dans `imageUrl`. Le bloc `{imageUrl && (...)}` produit le bouton et, lorsqu’il est ouvert, `<img src={imageUrl}>`.

Le `localStorage` ne conserve pas les images de tickets. Le seul stockage navigateur lié au scan est `sessionStorage["budgetkazpei:last-scan"]`, qui contient le brouillon structuré permettant de reprendre une validation, pas le fichier image. Le base64 utilisé par les moteurs OCR est un transport temporaire vers le fournisseur d’analyse ; il n’est pas la source de l’image affichée par l’historique. Cloud Run n’est donc pas dans le chemin de restitution de l’original.

Pour les tickets longs actuels, les deux ou trois fichiers navigateur sont assemblés en un JPEG avant l’upload : un seul composite est normalement persisté. Le nouveau contrat `image_paths text[]` permet néanmoins de référencer et supprimer N objets si un flux présent ou futur associe plusieurs fichiers au même ticket.

## Mécanisme antérieur et cause de l’échec

`receiptService.js` contenait `expireReceiptFromHistory`, qui appelait `removeReceiptFromHistory` avec le motif `automatic_7_days_expiry`. Ce code n’était appelé nulle part : aucun cron, job, Edge Function ou service serveur ne l’exécutait.

Même s’il avait été appelé côté client, son comportement était incorrect : il dépendait de l’ouverture de l’application, ne traitait qu’un chemin, positionnait `removed_from_history_at` et faisait donc disparaître tout le ticket de l’historique. Il ne constituait pas une politique de rétention serveur de l’image.

## Correctif local

- échéance `image_expires_at` calculée en base depuis `storage.objects.created_at`, jamais prolongeable par le client ;
- chemins multiples normalisés dans `image_paths` et limités au dossier du propriétaire ;
- politique RLS Storage refusant la lecture dès sept jours ;
- URL signée plafonnée côté serveur au temps restant avant expiration ;
- Edge Function protégée par secret, utilisant uniquement la service role côté serveur ;
- accès autorisé jusqu’à l’échéance exacte, puis purge physique non anticipée par un cron toutes les cinq minutes ;
- suppression de tous les chemins, puis mise à `NULL` des seules références image ;
- traitement séparé des objets Storage orphelins ;
- un échec Storage empêche la finalisation et sera retenté ; un objet déjà absent est accepté ;
- aucune instruction de suppression de `receipts`, `receipt_items`, `transactions` ou de données marché dans le job.

La migration et le job ne sont pas déployés ou planifiés. Le rattrapage historique reste en `dryRun` par défaut et nécessite une validation explicite avant `dryRun:false`.

## Compatibilité avant déploiement

Le frontend ne doit pas confondre l’absence du nouveau RPC avec une expiration. Si Supabase répond `PGRST202`, `42883` ou indique précisément que `receipt_image_remaining_seconds` n’existe pas encore, `getReceiptImageUrl` conserve temporairement le comportement historique et signe directement `image_path`. Une réponse RPC valide à zéro reste une expiration réelle ; une autre erreur backend ne déclenche pas ce fallback.
