#Requires -Version 5.1
# Inbound TCP for LAN browsers. Needs an elevated prompt.
param(
  [int]$Port = 43147
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Open an elevated PowerShell (Run as administrator) to add the firewall rule."
}

$ruleName = "FICSIT Live Map"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort $Port `
  -Action Allow `
  -Profile Domain,Private `
  | Out-Null

Write-Host "Allowed inbound TCP $Port on Domain/Private ($ruleName)."
Write-Host "Public profile is left blocked. Do not expose this on the internet without a reverse proxy you chose."
