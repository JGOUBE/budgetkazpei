param(
  [string]$ProjectId = "budgetkazpei",
  [string]$Region = "europe-west9",
  [string]$Location = "europe-west9",
  [string]$JobName = "budgetkazpei-good-deals-collector",
  [string]$SchedulerName = "budgetkazpei-good-deals-collector-schedule",
  [string]$SchedulerServiceAccount = "budgetkazpei-good-deals-scheduler@$ProjectId.iam.gserviceaccount.com"
)

$ErrorActionPreference = "Stop"

$activeProject = gcloud config get-value project 2>$null
if ($activeProject -ne $ProjectId) {
  throw "Projet Google Cloud actif inattendu: '$activeProject'. Attendu: '$ProjectId'."
}

Write-Host "Verification du compte de service Scheduler..."
gcloud iam service-accounts describe $SchedulerServiceAccount --project $ProjectId 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud iam service-accounts create "budgetkazpei-good-deals-scheduler" --display-name "BudgetKazPei Good Deals Scheduler" --project $ProjectId
}

gcloud projects add-iam-policy-binding $ProjectId `
  --member "serviceAccount:$SchedulerServiceAccount" `
  --role "roles/run.invoker" `
  --quiet

$jobUri = "https://$Region-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$ProjectId/jobs/$JobName:run"

Write-Host "Creation ou mise a jour du Cloud Scheduler $SchedulerName"
gcloud scheduler jobs describe $SchedulerName --location $Location --project $ProjectId 1>$null 2>$null
if ($LASTEXITCODE -eq 0) {
  gcloud scheduler jobs update http $SchedulerName `
    --project $ProjectId `
    --location $Location `
    --schedule "30 5 1,15 * *" `
    --time-zone "Indian/Reunion" `
    --uri $jobUri `
    --http-method POST `
    --oauth-service-account-email $SchedulerServiceAccount `
    --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
}
else {
  gcloud scheduler jobs create http $SchedulerName `
    --project $ProjectId `
    --location $Location `
    --schedule "30 5 1,15 * *" `
    --time-zone "Indian/Reunion" `
    --uri $jobUri `
    --http-method POST `
    --oauth-service-account-email $SchedulerServiceAccount `
    --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
}
