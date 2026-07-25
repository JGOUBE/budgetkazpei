param(
  [string]$ProjectId = "budgetkazpei",
  [string]$Region = "europe-west9",
  [string]$Repository = "budgetkazpei-jobs",
  [string]$ImageName = "budgetkazpei-good-deals-collector",
  [string]$JobName = "budgetkazpei-good-deals-collector",
  [bool]$DryRun = $true,
  [int]$MaxSources = 10,
  [bool]$OcrEnabled = $false,
  [string]$SupabaseUrlSecret = "SUPABASE_URL",
  [string]$SupabaseServiceRoleKeySecret = "SUPABASE_SERVICE_ROLE_KEY"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Invoke-GCloud {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "La commande gcloud a echoue: gcloud $($Arguments -join ' ')"
  }
}

$activeProject = gcloud config get-value project 2>$null
if ($activeProject -ne $ProjectId) {
  throw "Projet Google Cloud actif inattendu: '$activeProject'. Attendu: '$ProjectId'."
}

$dryRunValue = $DryRun.ToString().ToLowerInvariant()
$ocrEnabledValue = $OcrEnabled.ToString().ToLowerInvariant()
$imageUri = "$Region-docker.pkg.dev/$ProjectId/$Repository/$ImageName:latest"

Write-Host "Configuration du deploiement:"
Write-Host "  ProjectId : $ProjectId"
Write-Host "  Region    : $Region"
Write-Host "  JobName   : $JobName"
Write-Host "  Image URI : $imageUri"
Write-Host "  DryRun    : $dryRunValue"
Write-Host "  MaxSources: $MaxSources"
Write-Host "  OcrEnabled: $ocrEnabledValue"
Write-Host ""

Write-Host "Activation des APIs necessaires..."
Invoke-GCloud -Arguments @(
  "services",
  "enable",
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com",
  "secretmanager.googleapis.com",
  "--project",
  $ProjectId
)

& gcloud artifacts repositories describe $Repository --location $Region --project $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creation du depot Artifact Registry '$Repository' dans '$Region'..."
  Invoke-GCloud -Arguments @(
    "artifacts",
    "repositories",
    "create",
    $Repository,
    "--repository-format=docker",
    "--location",
    $Region,
    "--description",
    "Docker images for BudgetKazPei jobs",
    "--project",
    $ProjectId
  )
} else {
  Write-Host "Depot Artifact Registry '$Repository' deja present dans '$Region'."
}

Write-Host "Construction de l'image $imageUri"
Invoke-GCloud -Arguments @(
  "builds",
  "submit",
  "--tag",
  $imageUri,
  "--project",
  $ProjectId,
  "."
)

Write-Host "Creation ou mise a jour du Cloud Run Job $JobName"
Invoke-GCloud -Arguments @(
  "run",
  "jobs",
  "deploy",
  $JobName,
  "--project",
  $ProjectId,
  "--region",
  $Region,
  "--image",
  $imageUri,
  "--tasks",
  "1",
  "--parallelism",
  "1",
  "--max-retries",
  "0",
  "--cpu",
  "1",
  "--memory",
  "1Gi",
  "--task-timeout",
  "1800s",
  "--set-env-vars",
  "COLLECTOR_MODE=full,COLLECTOR_DRY_RUN=$dryRunValue,COLLECTOR_MAX_SOURCES=$MaxSources,COLLECTOR_TIMEZONE=Indian/Reunion,COLLECTOR_LOG_LEVEL=INFO,COLLECTOR_REQUEST_TIMEOUT_SECONDS=30,COLLECTOR_OCR_ENABLED=$ocrEnabledValue,COLLECTOR_OCR_MAX_PAGES=20",
  "--set-secrets",
  "SUPABASE_URL=$SupabaseUrlSecret:latest,SUPABASE_SERVICE_ROLE_KEY=$SupabaseServiceRoleKeySecret:latest"
)

Write-Host ""
Write-Host "Deploiement termine. Le Job n'est pas execute automatiquement."
Write-Host ""
Write-Host "Execution manuelle apres validation:"
Write-Host "gcloud run jobs execute $JobName --project $ProjectId --region $Region --wait"
Write-Host ""
Write-Host "Logs:"
Write-Host "gcloud logging read `"resource.type=cloud_run_job AND labels.`"run.googleapis.com/job_name`"=`"$JobName`"`" --project $ProjectId --limit 100 --format json"
