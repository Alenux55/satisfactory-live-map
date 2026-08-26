#Requires -Version 5.1
<#
  Registers a Scheduled Task that starts the map at logon and keeps it running.
  Run as the same Windows account that runs the dedicated server.
#>
param(
  [int]$Port = 43147,
  [string]$TaskName = "FICSIT Live Map"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runPs1 = Join-Path $RepoRoot "scripts\windows\run.ps1"
$node = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path (Join-Path $RepoRoot "node_modules\next\dist\bin\next"))) {
  throw "Build the app first: powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1"
}

$powershell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$args = "-NoProfile -ExecutionPolicy Bypass -File `"$runPs1`" -Port $Port"

$action = New-ScheduledTaskAction -Execute $powershell -Argument $args -WorkingDirectory $RepoRoot
$startup = New-ScheduledTaskTrigger -AtStartup
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger @($startup, $logon) `
  -Settings $settings `
  -Principal $principal `
  -Description "Satisfactory live map sidecar. Binds 0.0.0.0:$Port. Node=$node" `
  | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Registered and started scheduled task '$TaskName' as $env:USERNAME."
Write-Host "Remove with: powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-task.ps1"
