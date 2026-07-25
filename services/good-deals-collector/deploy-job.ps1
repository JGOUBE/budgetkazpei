param(
  [string]$ProjectId = "budgetkazpei",
  [string]$Region = "europe-west9",
  [string]$Repository = "budgetkazpei-jobs",
  [string]$ImageName = "budgetkazpei-good-deals-collector",
  [string]$JobName = "budgetkazpei-good-deals-collector",
  [string]$SupabaseUrlSecret = "SUPABASE_URL",
  [string]$SupabaseServiceRoleKeySecret = "SUPABASE_SERVICE_ROLE_KEY"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$activeProject = gcloud config get-value project 2>$null
if ($activeProject -ne $ProjectId) {
  throw "Projet Google Cloud actif inattendu: '$activeProject'. Attendu: '$ProjectId'."
}

Write-Host "Activation des APIs necessaires..."
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project $ProjectId

$imageUri = "$Region-docker.pkg.dev/$ProjectId/$Repository/$ImageName:latest"

Write-Host "Construction de l'image $imageUri"
gcloud builds submit --tag $imageUri --project $ProjectId .

Write-Host "Creation ou mise a jour du Cloud Run Job $JobName"
gcloud run jobs deploy $JobName `
  --project $ProjectId `
  --region $Region `
  --image $imageUri `
  --tasks 1 `
  --parallelism 1 `
  --max-retries 0 `
  --cpu 1 `
  --memory 1Gi `
  --task-timeout 1800s `
  --set-env-vars "COLLECTOR_MODE=full,COLLECTOR_DRY_RUN=false,COLLECTOR_TIMEZONE=Indian/Reunion,COLLECTOR_LOG_LEVEL=INFO,COLLECTOR_REQUEST_TIMEOUT_SECONDS=30,COLLECTOR_OCR_ENABLED=true,COLLECTOR_OCR_MAX_PAGES=20" `
  --set-secrets "SUPABASE_URL=$SupabaseUrlSecret:latest,SUPABASE_SERVICE_ROLE_KEY=$SupabaseServiceRoleKeySecret:latest"

Write-Host ""
Write-Host "Test manuel:"
Write-Host "gcloud run jobs execute $JobName --project $ProjectId --region $Region --wait"
Write-Host ""
Write-Host "Logs:"
Write-Host "gcloud logging read `"resource.type=cloud_run_job AND labels.`"run.googleapis.com/job_name`"=`"$JobName`"`" --project $ProjectId --limit 100 --format json"
