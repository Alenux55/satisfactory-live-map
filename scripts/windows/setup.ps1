#Requires -Version 5.1
<#
  Clone is already done. From the repo root:

    powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1

  Installs deps, production-builds, writes .env.local pointing at the DS SaveGames folder.
#>
param(
  [string]$SavesDir = "",
  [ValidateSet("watch", "demo")]
  [string]$Mode = "watch",
  [int]$PollSeconds = 300,
  [int]$Port = 43147,
  [switch]$SkipBuild,
  [switch]$InstallTask,
  [switch]$OpenFirewall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

function Get-NodeMajor {
  $raw = node -v
  if ($raw -notmatch "^v(\d+)") {
    throw "Node.js is not on PATH. Install Node 20 LTS from https://nodejs.org and reopen this prompt."
  }
  return [int]$Matches[1]
}

$major = Get-NodeMajor
if ($major -lt 20) {
  throw "Node $major is too old. Next.js 16 needs Node 20.9+."
}

if (-not $SavesDir) {
  $SavesDir = Join-Path $env:LOCALAPPDATA "FactoryGame\Saved\SaveGames\server"
}

Write-Host "Repo:      $RepoRoot"
Write-Host "Node:      $(node -v)   npm $(npm -v)"
Write-Host "SaveGames: $SavesDir"
Write-Host "Mode:      $Mode   poll ${PollSeconds}s   port $Port"

if (-not $SkipBuild) {
  Write-Host "`n== npm install =="
  npm install
  if (-not $?) { throw "npm install failed" }
  Write-Host "`n== npm run build =="
  npm run build
  if (-not $?) { throw "npm run build failed" }
}

$envPath = Join-Path $RepoRoot ".env.local"
$savesEnv = ($SavesDir -replace "\\", "/")
$dotenv = @"
HOSTNAME=0.0.0.0
PORT=$Port
FICSIT_SAVES_DIR=$savesEnv
FICSIT_MODE=$Mode
FICSIT_POLL_SECONDS=$PollSeconds
"@
[System.IO.File]::WriteAllText($envPath, $dotenv)
Write-Host "`nWrote $envPath"

if ($OpenFirewall) {
  try {
    & (Join-Path $PSScriptRoot "open-firewall.ps1") -Port $Port
  } catch {
    Write-Warning "Firewall rule skipped: $_"
  }
}

if ($InstallTask) {
  try {
    & (Join-Path $PSScriptRoot "install-task.ps1") -Port $Port
  } catch {
    Write-Warning "Scheduled task skipped: $_"
  }
}

Write-Host "`nStart (foreground):  powershell -ExecutionPolicy Bypass -File .\scripts\windows\run.ps1"
Write-Host "From another PC:     http://<this-machine-lan-ip>:$Port"
