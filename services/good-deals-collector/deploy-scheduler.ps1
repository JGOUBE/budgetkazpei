# BudgetKazPei catalogue cadence: two checks per month, no automatic activation.
# Safe default: print the planned change. No jobs or IAM permissions are created.
param(
  [string]$ProjectId = "budgetkazpei",
  [string]$Location = "europe-west1",
  [string]$SchedulerName = "budgetkazpei-good-deals-collector-schedule",
  [string]$Schedule = "30 6 4,18 * *",
  [switch]$Apply,
  [switch]$Resume
)

$ErrorActionPreference = "Stop"
Write-Host "Job existant   : $SchedulerName"
Write-Host "Region         : $Location"
Write-Host "Calendrier     : $Schedule (Indian/Reunion)"
Write-Host "Activation     : " $(if ($Resume) { "demandee explicitement" } else { "INTERDITE / reste suspendu" })

if ($Resume -and -not $Apply) {
  throw "-Resume ne peut etre utilise qu'avec -Apply."
}
if (-not $Apply) {
  Write-Host "Aucune modification appliquee. Utiliser -Apply pour configurer le job en restant suspendu."
  return
}

$activeProject = (& gcloud.cmd config get-value project 2>$null).Trim()
if ($activeProject -ne $ProjectId) {
  throw "Projet Google Cloud actif inattendu: '$activeProject'. Attendu: '$ProjectId'."
}

# The existing job is in europe-west1 (Cloud Run is in europe-west9).
# Never create a second scheduler in a different region by mistake.
& gcloud.cmd scheduler jobs describe $SchedulerName --location $Location --project $ProjectId 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Job introuvable dans $Location. Aucune creation automatique: verifier sa region dans Cloud Console."
}

# Update schedule only, preserving the existing Cloud Run target and OAuth identity.
& gcloud.cmd scheduler jobs update http $SchedulerName `
  --project $ProjectId `
  --location $Location `
  --schedule $Schedule `
  --time-zone "Indian/Reunion" `
  --max-retry-attempts 0

if ($LASTEXITCODE -ne 0) {
  throw "Echec de mise a jour du calendrier Cloud Scheduler."
}

$state = (& gcloud.cmd scheduler jobs describe $SchedulerName --location $Location --project $ProjectId --format "value(state)").Trim()
if ($LASTEXITCODE -ne 0) { throw "Impossible de verifier l'etat de la tache." }

if ($Resume) {
  if ($state -eq "PAUSED") {
    & gcloud.cmd scheduler jobs resume $SchedulerName --location $Location --project $ProjectId
    if ($LASTEXITCODE -ne 0) { throw "Impossible de reprendre la tache." }
  }
  Write-Host "Tache activee sur demande explicite."
}
else {
  if ($state -ne "PAUSED") {
    & gcloud.cmd scheduler jobs pause $SchedulerName --location $Location --project $ProjectId
    if ($LASTEXITCODE -ne 0) { throw "Impossible de suspendre la tache: suspendre depuis la console." }
  }
  Write-Host "Calendrier mis a jour. Tache toujours suspendue."
}
