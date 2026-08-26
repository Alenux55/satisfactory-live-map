#Requires -Version 5.1
# Production process. Do not use npm run dev on the dedicated server.
param(
  [int]$Port = 43147
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$next = Join-Path $RepoRoot "node_modules\next\dist\bin\next"
if (-not (Test-Path $next)) {
  throw "Missing $next. Run scripts\windows\setup.ps1 first (npm install, npm run build)."
}

$env:NODE_ENV = "production"
if (-not $env:HOSTNAME) { $env:HOSTNAME = "0.0.0.0" }
if (-not $env:PORT) { $env:PORT = "$Port" }

$node = (Get-Command node -ErrorAction Stop).Source
Write-Host "FICSIT Live Map  $node $next start -H 0.0.0.0 -p $($env:PORT)"
Write-Host "cwd $RepoRoot"
& $node $next start -H 0.0.0.0 -p $env:PORT
exit $LASTEXITCODE
