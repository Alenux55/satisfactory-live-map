#Requires -Version 5.1
param(
  [int]$Port = 43147,
  [string]$TaskName = "FICSIT Live Map"
)
& (Join-Path $PSScriptRoot "service.ps1") -Action Install -Port $Port -TaskName $TaskName
