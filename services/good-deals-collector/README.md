# BudgetKazPei Good Deals Collector

Service Python isole pour enrichir automatiquement la rubrique "Mes bons plans" sans toucher au scanner de tickets Cloud Run existant.

## Architecture

- `services/receipt-scanner/` reste totalement independant.
- `services/good-deals-collector/` contient un Cloud Run Job separe, sans port HTTP, execute a la demande ou via Cloud Scheduler.
- Le collecteur lit uniquement des sources officielles confirmees, calcule des snapshots SHA-256, genere des candidats, puis publie de maniere centralisee.
- Les parsers non fiables ne sont pas forces: ils restent `pending`.

## Dossier

- `app/main.py`: point d'entree CLI du job.
- `app/config.py`: variables d'environnement et garde-fous.
- `app/logging_config.py`: logs JSON structures.
- `app/collectors/`: telechargement HTML / PDF / image.
- `app/parsers/`: parseurs generiques et premiers parseurs reels.
- `app/services/`: hash, normalisation, doublons, confiance, expiration, mode scheduler.
- `app/db/`: client Supabase REST, repository et publication centralisee.
- `tests/`: tests unitaires locaux sans secret reel.

## Separation avec le scanner

- aucun appel a `budgetkazpei-scanner-api`
- aucun import depuis `services/receipt-scanner`
- OCR local seulement en dependance technique optionnelle
- deploiement, image Docker et scripts separes

## Variables d'environnement

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COLLECTOR_MODE=full|shopping|events|permanent|dry-run`
- `COLLECTOR_DRY_RUN=true|false`
- `COLLECTOR_MAX_SOURCES`
- `COLLECTOR_MAX_DOCUMENTS`
- `COLLECTOR_REQUEST_TIMEOUT_SECONDS`
- `COLLECTOR_OCR_ENABLED=true|false`
- `COLLECTOR_OCR_MAX_PAGES`
- `COLLECTOR_LOG_LEVEL=INFO`
- `COLLECTOR_TIMEZONE=Indian/Reunion`
- `COLLECTOR_TEMP_DIR`

## Lancement local

Depuis `services/good-deals-collector`:

```powershell
python -m app.main --mode full --dry-run --max-sources 5
```

Ou avec le script:

```powershell
.\run-local.ps1 -Mode full -DryRun -MaxSources 5
```

Smoke dry-run sans reseau ni secrets:

```powershell
python -m app.main --mode dry-run --dry-run --max-sources 0
```

## Dry-run

Le dry-run:

- lit les sources actives
- telecharge les documents
- calcule les hashes
- parse les contenus
- calcule la confiance
- detecte les doublons
- n'ecrit rien dans les tables metier finales

Si `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` sont absents, le collecteur bascule automatiquement sur un repository memoire pour les tests locaux.

## Sources actuellement supportees

Parseurs reels actifs:

- Carrefour Reunion
- Magasins U Reunion
- Run Market Reunion
- Auchan Saint-Louis
- E.Leclerc Reunion
- Ville de Saint-Paul (evenements)
- Ville du Port (loisirs permanents)

## Validation d'un candidat

- `approved`: score >= 95 et aucun champ bloquant absent
- `needs_review`: score 75-94 ou doute sur les champs critiques
- `rejected`: score trop faible ou incoherences fortes
- `duplicate`: cle de doublon deja vue
- `expired`: contenu deja termine

## Publication centralisee

`app/db/publisher.py`:

- relit le candidat depuis la couche repository
- upsert l'organisme
- upsert le magasin si besoin
- upsert le produit et ses alias
- upsert le catalogue
- upsert la promotion
- upsert la carte `good_deals`
- marque le candidat `published`

L'idempotence repose sur `external_key` et les indexes uniques ajoutes par la migration.

## Tests

```powershell
python -m unittest discover -s tests -v
```

## Secrets

Exemple de creation:

```powershell
echo -n "https://<project>.supabase.co" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "<service-role-key>" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
```

## Deploiement Cloud Run Job

Premier deploiement securise en dry-run:

```powershell
.\deploy-job.ps1 -DryRun $true -MaxSources 10 -OcrEnabled $false
```

Le script:

- verifie le projet Google Cloud actif
- active les APIs necessaires
- cree automatiquement le depot Artifact Registry `budgetkazpei-jobs` dans `europe-west9` s'il n'existe pas encore
- construit l'image
- cree ou met a jour le job
- connecte les secrets
- fixe `COLLECTOR_DRY_RUN=true` par defaut pour le premier deploiement
- fixe `COLLECTOR_MAX_SOURCES=10` par defaut
- fixe `COLLECTOR_OCR_ENABLED=false` par defaut
- fixe CPU, RAM et timeout
- n'execute jamais le job automatiquement

Execution manuelle apres validation du deploiement:

```powershell
gcloud run jobs execute budgetkazpei-good-deals-collector --project budgetkazpei --region europe-west9 --wait
```

Lecture des logs:

```powershell
gcloud logging read "resource.type=cloud_run_job AND labels.\"run.googleapis.com/job_name\"=\"budgetkazpei-good-deals-collector\"" --project budgetkazpei --limit 100 --format json
```

## Creation du Scheduler

Ne creer le Scheduler qu'apres validation manuelle du Job en dry-run.

```powershell
.\deploy-scheduler.ps1
```

Le script maintient un seul scheduler:

- cron `30 5 1,15 * *`
- fuseau `Indian/Reunion`
- appel HTTP au job Cloud Run

## Logs

Tous les logs importants sortent en JSON et doivent porter:

- `run_key`
- `source_slug`
- `content_family`
- `action`
- `duration_ms`
- `result`
- `candidate_count`
- `error_type`

## Ajout d'un nouveau parser

1. ajouter la source officielle dans `app/collectors/registry.py`
2. creer un parser dans `app/parsers/`
3. l'enregistrer dans `app/main.py`
4. ajouter un test de normalisation, un test de confiance et un test d'idempotence si le contenu est publiable

## Desactivation temporaire d'une source

- passer `is_active = false` dans `good_deal_sources`
- ou desactiver l'entree locale tant que la source n'est pas encore migree en base

## Rollback

- desactiver le scheduler
- desactiver les sources fautives
- redeployer le job avec `COLLECTOR_DRY_RUN=true` si besoin
- annuler ou corriger les candidats en `needs_review`
- si necessaire, supprimer uniquement les colonnes et tables de la migration du collecteur via une migration corrective dediee
