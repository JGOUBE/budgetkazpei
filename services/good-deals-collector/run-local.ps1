param(
  [string]$Mode = "full",
  [switch]$DryRun,
  [int]$MaxSources = 5
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$env:COLLECTOR_MODE = $Mode
if ($DryRun.IsPresent) {
  $env:COLLECTOR_DRY_RUN = "true"
}

$arguments = @("-m", "app.main", "--mode", $Mode, "--max-sources", "$MaxSources")
if ($DryRun.IsPresent) {
  $arguments += "--dry-run"
}

python @arguments
