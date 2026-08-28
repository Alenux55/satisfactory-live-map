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
  Start/Rebuild host the map as a hidden FICSIT Live Map process (not a PowerShell window).
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
$RunPs1 = Join-Path $PSScriptRoot "run.ps1"
$LauncherSrc = Join-Path $PSScriptRoot "launcher.cs"
$LauncherExe = Join-Path $RepoRoot "data\FicsitLiveMap.exe"
$LauncherIcon = Join-Path $RepoRoot "src\app\favicon.ico"
$PowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

function Get-Task {
  return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Get-Csc {
  $candidates = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }
  return $null
}

function Get-LauncherExe {
  $csc = Get-Csc
  if (-not $csc) {
    throw "Missing .NET Framework C# compiler (csc.exe). Install .NET Framework 4.8 Developer Pack, or the in-box 4.x runtime compiler."
  }
  $stale = -not (Test-Path $LauncherExe)
  if (-not $stale) {
    $stale = (Get-Item $LauncherSrc).LastWriteTimeUtc -gt (Get-Item $LauncherExe).LastWriteTimeUtc
  }
  if ($stale) {
    New-Item -ItemType Directory -Force -Path (Split-Path $LauncherExe) | Out-Null
    $compileArgs = @("/nologo", "/target:winexe", "/optimize+", "/out:$LauncherExe")
    if (Test-Path $LauncherIcon) { $compileArgs += "/win32icon:$LauncherIcon" }
    $compileArgs += $LauncherSrc
    $output = & $csc @compileArgs 2>&1
    if ($LASTEXITCODE -ne 0 -and (Test-Path $LauncherIcon)) {
      Write-Warning "Could not embed map icon; compiling without it."
      $compileArgs = @("/nologo", "/target:winexe", "/optimize+", "/out:$LauncherExe", $LauncherSrc)
      $output = & $csc @compileArgs 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Could not compile FICSIT Live Map launcher: $output"
    }
  }
  return $LauncherExe
}

function Get-HiddenPowerShellArgs {
  return "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$RunPs1`" -Port $Port"
}

function Get-MapAction {
  try {
    $exe = Get-LauncherExe
    $node = (Get-Command node -ErrorAction Stop).Source
    $arg = "-Repo `"$RepoRoot`" -Port $Port -Node `"$node`""
    return New-ScheduledTaskAction -Execute $exe -Argument $arg -WorkingDirectory $RepoRoot
  } catch {
    Write-Warning "$_ Falling back to a hidden PowerShell host."
    return New-ScheduledTaskAction -Execute $PowerShell -Argument (Get-HiddenPowerShellArgs) -WorkingDirectory $RepoRoot
  }
}

function Update-TaskAction {
  $task = Get-Task
  if (-not $task) { return }
  try {
    $desired = Get-MapAction
    $current = @($task.Actions)[0]
    if (
      $current -and
      $current.Execute -eq $desired.Execute -and
      [string]$current.Arguments -eq [string]$desired.Arguments
    ) {
      return
    }
    Set-ScheduledTask -TaskName $TaskName -Action $desired | Out-Null
  } catch {
    Write-Warning "Could not update scheduled task '$TaskName' ($($_.Exception.Message.Trim())). Start will still run. Re-run Install as the Windows account that owns the task if the launcher path changed."
  }
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
  Get-Process -Name "FicsitLiveMap" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-ProcessTree -ProcessId $_.Id }
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
  $actionObj = Get-MapAction
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

function Start-MapProcess {
  try {
    $exe = Get-LauncherExe
    $node = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $exe -WorkingDirectory $RepoRoot -WindowStyle Hidden `
      -ArgumentList @("-Repo", $RepoRoot, "-Port", "$Port", "-Node", $node)
  } catch {
    Write-Warning "$_ Falling back to a hidden PowerShell host."
    Start-Process -FilePath $PowerShell -WorkingDirectory $RepoRoot -WindowStyle Hidden `
      -ArgumentList (Get-HiddenPowerShellArgs)
  }
}

function Invoke-Start {
  Update-TaskAction
  $task = Get-Task
  $startedTask = $false
  if ($task) {
    try {
      Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
      $startedTask = $true
      Write-Host "Started scheduled task '$TaskName' (no console window)."
    } catch {
      Write-Warning "Could not start scheduled task '$TaskName' ($($_.Exception.Message.Trim())). Starting the map process directly."
    }
  } else {
    Write-Host "No scheduled task yet. Starting in the background. Use Install for boot."
  }
  if (-not $startedTask) {
    Start-MapProcess
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
