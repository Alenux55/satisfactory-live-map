#Requires -Version 5.1
param(
  [string]$TaskName = "FICSIT Live Map"
)
& (Join-Path $PSScriptRoot "service.ps1") -Action Uninstall -TaskName $TaskName
