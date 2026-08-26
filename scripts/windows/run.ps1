#Requires -Version 5.1
# Production process. Do not use npm run dev on the dedicated server.
param(
  [int]$Port = 43147,
  [ValidateSet("debug", "info", "warn", "error")]
  [string]$LogLevel = "info"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$starter = Join-Path $RepoRoot "scripts\start.mjs"
if (-not (Test-Path $starter)) {
  throw "Missing $starter"
}

$env:NODE_ENV = "production"
if (-not $env:HOSTNAME) { $env:HOSTNAME = "0.0.0.0" }
if (-not $env:PORT) { $env:PORT = "$Port" }
if (-not $env:FICSIT_LOG) { $env:FICSIT_LOG = $LogLevel }
if (-not $env:FICSIT_LOG_FILE) { $env:FICSIT_LOG_FILE = (Join-Path $RepoRoot "data\server.log") }

$node = (Get-Command node -ErrorAction Stop).Source
Write-Host "FICSIT Live Map start  log=$($env:FICSIT_LOG)  file=$($env:FICSIT_LOG_FILE)  port=$($env:PORT)"
& $node $starter
if (-not $?) { exit 1 }
