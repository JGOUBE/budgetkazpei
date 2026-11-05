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

## Cadence sobre et protection contre les frais (novembre 2026)

La collecte quotidienne n'est plus le regime recommande pour les catalogues.
Les catalogues E.Leclerc et Auchan demarrent souvent pres du debut et du milieu
du mois. Un premier essai raisonnable est **les 4 et 18 a 06h30 (Indian/Reunion)** :
deux passages par mois, plutot que trente. Cette cadence pourra etre reajustee
en fonction des dates officielles observees. Une collecte ponctuelle reste possible
en cas d'operation exceptionnelle, apres verification du besoin.

**Etat de production : les quatre jobs Cloud Scheduler ont ete suspendus par le proprietaire.
Ne pas les reprendre pendant les tests.** Le script `deploy-scheduler.ps1` :

- affiche uniquement le plan sans `-Apply` ;
- modifie uniquement la cadence du job existant dans **europe-west1** ;
- ne cree jamais un nouveau Scheduler et ne modifie ni sa cible ni son identite OAuth ;
- conserve le job suspendu sauf si `-Apply -Resume` est volontairement fourni ;
- desactive les tentatives de relance Scheduler (`--max-retry-attempts 0`).

Previsualiser sans acces Google Cloud ni frais :

```powershell
.\deploy-scheduler.ps1
```

Configurer **sans activer** (a faire seulement apres validation des tests) :

```powershell
.\deploy-scheduler.ps1 -Apply
```

La reactivation eventuelle demanderait `-Apply -Resume`, **pas pour maintenant**.
Les trois jobs incrementaux Carrefour/E.Leclerc/Leader Price restent egalement
suspendus jusqu'a audit de leur rendement et de leurs sources ; leur calendrier
n'est pas change par ce script.

### Pistes de correction et criteres de qualite

- E.Leclerc : lien du catalogue lu independamment de l'ordre des attributs HTML ;
  dates exigees avant publication, sans inventer une periode.
- Carrefour : accepter une periode abregee du type « du 02 au 08 novembre »
  uniquement si elle se situe pres de la date d'observation.
- Run Market : utiliser l'index officiel `/accueil-2/` et les liens Calameo,
  sans republier une ancienne brochure avec de nouvelles dates.
- Doublons : distinguer les catalogues par leur lien normalise, pas seulement
  par le titre generique « Nouveau catalogue » et les dates.
- Mesure : `diagnostic-catalogues.sql` lit directement Supabase et permet de
  comparer les erreurs, les nouvelles publications et les doublons sans Cloud Run.
- L'absence d'entrees reste une erreur visible dans les logs, jamais une
  fausse publication reussie.
- La colonne `trigger_type` etait codee en dur a `manual` pour chaque run ;
  les nouvelles executions seront `unknown` sauf identification explicite du
  lanceur via `--trigger-type`. Les anciennes valeurs ne prouvent pas la
  presence d'un declencheur manuel.

### Protections supplementaires et rendement reel

Analyse Supabase (30 jours avant le 2 novembre 2026) :

| Source | Controles | Echecs | Nouveaux candidats publies |
| --- | ---: | ---: | ---: |
| Auchan Saint-Louis | 23 | 1 | 2 |
| Carrefour | 25 | 2 | 0 |
| E.Leclerc | 27 | 10 | 2 |
| Run Market | 23 | 18 | 1 |
| Magasins U | 23 | 1 | 0 |

Les chiffres sont un instantane des candidats dont la ligne a ete creee sur
la periode (pas un journal immuable). **Run Market est retire de la selection
automatique dans le registre local** : il reste testable ponctuellement par
`--source-slug run-market-reunion-home --dry-run`. Il ne faut pas lancer ce
test sur Cloud Run tant que les pages ne sont pas validees localement.

Protections nouvelles :

- Une source desactivee via `good_deal_sources.is_active=false` est ignoree
  **avant** l'appel reseau, meme si le registre local la connait.
- Une tentative de publication echouee ne doit pas devenir un faux cache
  « aucun changement » lors du passage suivant.
- Un candidat avec le meme `external_key` n'est pas un doublon de lui-meme :
  il peut etre republie apres une erreur, sans cacher les vrais doublons.
- Une page HTTP 403/404/500 n'est jamais consideree comme une page de catalogues.
- Sans credentials Supabase, une execution non dry-run echoue explicitement
  plutot que de « publier » seulement en memoire.
- Un publieur qui ne retourne pas d'identifiant est comptabilise comme erreur.
- Les `metrics.source_results` permettent de lire les statistiques par source
  dans le rapport de chaque execution (sans une table supplementaire).

La frequence de 2 fois par mois reste **une hypothese a confirmer** :
Carrefour publie parfois des catalogues hebdomadaires. Le calcul doit porter
sur le nombre de promotions encore valides et visibles, pas seulement sur
le nombre de taches executees.

### Protections supplementaires pour limiter les executions inutiles

- `COLLECTOR_DRY_RUN` vaut **true par defaut** : toute publication necessite
  l'activation explicite de `COLLECTOR_DRY_RUN=false`.
- Une source dont `good_deal_sources.is_active=false` n'est pas interrogee
  (aucun HTTP pour cette source), meme si le registre du code l'indique active.
- Un candidat deja en base avec la meme `external_key` n'est pas marque
  comme doublon de lui-meme.
- Une empreinte issue d'une tentative echouee ne bloque plus un nouvel essai.
- Si une source ou l'enregistrement du journal d'erreur echoue, les autres
  sources continuent au lieu de perdre toute la collecte.
- Chaque execution ecrit un petit tableau de resultat par source dans
  `good_deal_ingestion_runs.metrics.source_results` : publies,
  doublons, elements a revoir, erreurs et changements, sans nouvelle table.

**Important** : ce sont des protections du code de la branche de travail,
pas une modification de la production ni une preuve de rendement reel.
Tester d'abord les parseurs sur les pages officielles actuelles et executer
la suite unitaire en local, puis faire un essai controle avant tout Scheduler.

### Controle avant toute reactivation

1. Executer les tests hors Cloud Run : `python -m unittest discover -s tests -v`.
2. Tester les HTML officiels actuels hors Google Cloud (ou avec des captures
   locales), sans requete Cloud Run payante, et verifier titres/liens/dates.
3. Comparer pour chaque enseigne les entrees fiables et les doublons ; aucune
   publication de dates incertaines ou de liens de catalogue perimes.
4. Examiner les logs des executions Cloud Run : qui lance les jobs vers 06h00 ?
   La colonne `trigger_type=manual` historique ne permet **pas** de repondre.
5. Controler les tarifs Google Cloud et l'absence de nouveaux declencheurs
   avant de reprogrammer le job. Les catalogues historiques restent conserves.

La nouvelle URL Run Market dans le registre local doit egalement etre repercutee
dans `good_deal_sources.source_url` lors du deploiement, si le tableau de bord
admin affiche cette table. Aucun changement Supabase n'est effectue ici.

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
