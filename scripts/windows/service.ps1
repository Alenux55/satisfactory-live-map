#Requires -Version 5.1
<#
  Manage the live map as a Windows Scheduled Task (start, stop, rebuild, boot).

    powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Install
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Status
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Start
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Stop
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Restart
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Rebuild
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Uninstall

  Rebuild optional: -Pull  to git pull before npm run build.
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("Install", "Uninstall", "Start", "Stop", "Restart", "Rebuild", "Status")]
  [string]$Action,

  [int]$Port = 43147,
  [string]$TaskName = "FICSIT Live Map",
  [switch]$Pull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PidFile = Join-Path $RepoRoot "data\server.pid"
$RunPs1 = Join-Path $RepoRoot "scripts\windows\run.ps1"
$PowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

function Get-Task {
  return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return }
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ParentProcessId -eq $ProcessId } |
    ForEach-Object { Stop-ProcessTree -ProcessId $_.ProcessId }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-MapProcess {
  if (Test-Path $PidFile) {
    try {
      $info = Get-Content -Raw -Path $PidFile | ConvertFrom-Json
      if ($null -ne $info.next) { Stop-ProcessTree -ProcessId ([int]$info.next) }
      if ($null -ne $info.starter) { Stop-ProcessTree -ProcessId ([int]$info.starter) }
    } catch {
      Write-Warning "Could not read $PidFile : $_"
    }
  }
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-ProcessTree -ProcessId $_.OwningProcess }
  if (Test-Path $PidFile) {
    Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
  }
}

function Wait-Port {
  param([switch]$Open, [int]$Seconds = 40)
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    $listening = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($Open -and $listening) { return $true }
    if (-not $Open -and -not $listening) { return $true }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Invoke-Install {
  if (-not (Test-Path (Join-Path $RepoRoot "node_modules\next\dist\bin\next"))) {
    throw "Build the app first: powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup.ps1"
  }
  $node = (Get-Command node -ErrorAction Stop).Source
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$RunPs1`" -Port $Port"
  $actionObj = New-ScheduledTaskAction -Execute $PowerShell -Argument $arg -WorkingDirectory $RepoRoot
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
    -Action $actionObj `
    -Trigger @($startup, $logon) `
    -Settings $settings `
    -Principal $principal `
    -Description "Satisfactory live map sidecar. Binds 0.0.0.0:$Port. Node=$node" |
    Out-Null
  Write-Host "Installed scheduled task '$TaskName' as $env:USERNAME (AtStartup + AtLogOn, restart on crash)."
  Invoke-Start
}

function Invoke-Uninstall {
  Invoke-Stop
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task '$TaskName'."
}

function Invoke-Start {
  $task = Get-Task
  if ($task) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Started scheduled task '$TaskName'."
  } else {
    Write-Host "No scheduled task yet. Starting in the background. Use Install for boot."
    Start-Process -FilePath $PowerShell -WorkingDirectory $RepoRoot -WindowStyle Hidden `
      -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$RunPs1`" -Port $Port"
  }
  if (Wait-Port -Open -Seconds 45) {
    Write-Host "Listening on 0.0.0.0:$Port"
  } else {
    Write-Warning "Port $Port is not listening yet. Check data\server.log"
  }
}

function Invoke-Stop {
  $task = Get-Task
  if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  }
  Stop-MapProcess
  if (-not (Wait-Port -Open:$false -Seconds 10)) {
    Write-Warning "Port $Port still appears to be in use."
  } else {
    Write-Host "Stopped."
  }
}

function Invoke-Restart {
  Invoke-Stop
  Invoke-Start
}

function Invoke-Rebuild {
  Invoke-Stop
  Set-Location $RepoRoot
  if ($Pull) {
    Write-Host "== git pull =="
    git pull
    if (-not $?) { throw "git pull failed" }
  }
  Write-Host "== npm install =="
  npm install
  if (-not $?) { throw "npm install failed" }
  Write-Host "== npm run build =="
  npm run build
  if (-not $?) { throw "npm run build failed" }
  Invoke-Start
}

function Invoke-Status {
  $task = Get-Task
  if ($task) {
    $info = $task | Get-ScheduledTaskInfo
    Write-Host "Task:    $TaskName  state=$($task.State)  last=$($info.LastTaskResult)  lastRun=$($info.LastRunTime)"
  } else {
    Write-Host "Task:    (not installed)  run Install to start at boot"
  }
  if (Test-Path $PidFile) {
    Write-Host "PidFile: $(Get-Content -Raw $PidFile)"
  } else {
    Write-Host "PidFile: (none)"
  }
  $listen = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($listen.Count -gt 0) {
    Write-Host "Listen:  0.0.0.0:$Port  pid=$($listen[0].OwningProcess)"
  } else {
    Write-Host "Listen:  (not listening on $Port)"
  }
}

switch ($Action) {
  "Install" { Invoke-Install }
  "Uninstall" { Invoke-Uninstall }
  "Start" { Invoke-Start }
  "Stop" { Invoke-Stop }
  "Restart" { Invoke-Restart }
  "Rebuild" { Invoke-Rebuild }
  "Status" { Invoke-Status }
}
