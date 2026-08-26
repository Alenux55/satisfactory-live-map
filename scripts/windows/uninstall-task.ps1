#Requires -Version 5.1
param(
  [string]$TaskName = "FICSIT Live Map"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task '$TaskName'."
