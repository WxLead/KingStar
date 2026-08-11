<#
.SYNOPSIS
  One-click local start: MinerU (:8000) + BFF (:8080) + Web (:3000)

.PARAMETER Mode
  Window     — each service in its own console (default, easy to watch logs)
  Background — no console windows; logs under scripts/.logs/

.PARAMETER Background
  Shortcut for -Mode Background

.PARAMETER Window
  Shortcut for -Mode Window

.PARAMETER SkipMinerU
  Do not start MinerU (use if already running).

.PARAMETER MinerUHome
  MinerU repo / install root. Default: $env:MINERU_HOME (required to auto-start MinerU unless -SkipMinerU).

.EXAMPLE
  .\scripts\dev-up.ps1
  .\scripts\dev-up.ps1 -Background
  .\scripts\dev-up.ps1 -Mode Background -SkipMinerU
#>
param(
  [ValidateSet("Window", "Background")]
  [string]$Mode = "Window",
  [switch]$Background,
  [switch]$Window,
  [switch]$SkipMinerU,
  [string]$MinerUHome = ""
)

$ErrorActionPreference = "Stop"

if ($Background) { $Mode = "Background" }
if ($Window) { $Mode = "Window" }

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ApiDir = Join-Path $Root "services\api"
$WebDir = Join-Path $Root "apps\web"
$LogDir = Join-Path $PSScriptRoot ".logs"
$PidFile = Join-Path $PSScriptRoot ".dev-pids.json"

if (-not $MinerUHome) {
  $MinerUHome = if ($env:MINERU_HOME) { $env:MINERU_HOME } else { "" }
}

function Test-PortListening([int]$Port) {
  # Only count Listen sockets whose OwningProcess still exists (ignore Windows ghost binds).
  try {
    $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($c in $conns) {
      $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
      if ($null -ne $proc) { return $true }
    }
    return $false
  } catch {
    return $false
  }
}

function Test-HttpOk([string]$Url, [int]$TimeoutSec = 2) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
    return $r.StatusCode -ge 200 -and $r.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Save-DevPid {
  param([string]$Name, [int]$ProcessId, [int]$Port)
  $entries = @()
  if (Test-Path $PidFile) {
    try {
      $entries = @(Get-Content $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json)
      if ($null -eq $entries) { $entries = @() }
    } catch {
      $entries = @()
    }
  }
  $entries = @($entries | Where-Object { $_.name -ne $Name -and $_.port -ne $Port })
  $entries += [pscustomobject]@{
    name       = $Name
    pid        = $ProcessId
    port       = $Port
    mode       = $Mode
    started_at = (Get-Date).ToString("o")
  }
  ($entries | ConvertTo-Json -Depth 4) | Set-Content -Path $PidFile -Encoding UTF8
}

function Start-DevService {
  param(
    [string]$Name,
    [int]$Port,
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  if ($Mode -eq "Window") {
    $ps = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location -LiteralPath '$WorkingDirectory'
Write-Host '==> $Title' -ForegroundColor Cyan
Write-Host '$Command' -ForegroundColor DarkGray
$Command
Write-Host ''
Write-Host 'Process exited. Press Enter to close.' -ForegroundColor Yellow
Read-Host
"@
    $proc = Start-Process -FilePath "powershell.exe" -PassThru -ArgumentList @(
      "-NoExit",
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", $ps
    )
    Save-DevPid -Name $Name -ProcessId $proc.Id -Port $Port
    return
  }

  # Background: hidden window, stdout/stderr → log file
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $logPath = Join-Path $LogDir "$Name.log"
  $errPath = Join-Path $LogDir "$Name.err.log"
  # Clear previous run logs (ignore if still locked by a dead redirect handle)
  foreach ($p in @($logPath, $errPath)) {
    try {
      "" | Set-Content -Path $p -Encoding UTF8 -ErrorAction Stop
    } catch {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      if ($p -eq $logPath) {
        $logPath = Join-Path $LogDir "$Name-$stamp.log"
      } else {
        $errPath = Join-Path $LogDir "$Name-$stamp.err.log"
      }
    }
  }

  $ps = @"
Set-Location -LiteralPath '$WorkingDirectory'
`$ErrorActionPreference = 'Continue'
try {
  $Command
} catch {
  `$_ | Out-String | Add-Content -LiteralPath '$errPath' -Encoding UTF8
  throw
}
"@
  $proc = Start-Process -FilePath "powershell.exe" -PassThru -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $ps
  ) -RedirectStandardOutput $logPath -RedirectStandardError $errPath

  Save-DevPid -Name $Name -ProcessId $proc.Id -Port $Port
  Write-Host "       log: $logPath" -ForegroundColor DarkGray
}

Write-Host "StarT root: $Root" -ForegroundColor Green
Write-Host "Mode:       $Mode" -ForegroundColor Green

# --- MinerU ---
if ($SkipMinerU) {
  Write-Host "[skip] MinerU (-SkipMinerU)" -ForegroundColor DarkYellow
} elseif ((Test-PortListening 8000) -and (Test-HttpOk "http://127.0.0.1:8000/docs")) {
  Write-Host "[ok]   MinerU already on :8000" -ForegroundColor DarkYellow
} else {
  if (-not $MinerUHome -or -not (Test-Path $MinerUHome)) {
    if (-not $MinerUHome) {
      Write-Host "[warn] MinerU home not set. Set MINERU_HOME or pass -MinerUHome /path/to/MinerU." -ForegroundColor Yellow
    } else {
      Write-Host "[warn] MinerU home not found: $MinerUHome" -ForegroundColor Yellow
    }
    Write-Host "       Continuing without starting MinerU (use -SkipMinerU to silence, or start mineru-api yourself)." -ForegroundColor Yellow
  } else {
    if (Test-PortListening 8000) {
      Write-Host "[warn] :8000 looks occupied but MinerU health failed; starting anyway" -ForegroundColor Yellow
    }
    $mineruCmd = "mineru-api --host 127.0.0.1 --port 8000"
    $venvActivate = Join-Path $MinerUHome ".venv\Scripts\Activate.ps1"
    if (Test-Path $venvActivate) {
      $mineruCmd = "& '$venvActivate'; $mineruCmd"
    }
    Write-Host "[start] MinerU :8000  ($MinerUHome)" -ForegroundColor Cyan
    Start-DevService -Name "mineru" -Port 8000 -Title "StarT MinerU :8000" `
      -WorkingDirectory $MinerUHome -Command $mineruCmd
  }
}

# --- BFF ---
if ((Test-PortListening 8080) -and (Test-HttpOk "http://127.0.0.1:8080/api/v1/health")) {
  Write-Host "[ok]   BFF already on :8080" -ForegroundColor DarkYellow
} else {
  $apiPython = Join-Path $ApiDir ".venv\Scripts\python.exe"
  if (-not (Test-Path $apiPython)) {
    throw "BFF venv missing: $apiPython`nRun first-time setup from README (pip install -e ...)."
  }
  if (-not (Test-PortListening 8080) -and (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)) {
    Write-Host "[warn] :8080 has ghost Listen entries (no live process); starting BFF" -ForegroundColor Yellow
  } elseif (Test-PortListening 8080) {
    Write-Host "[warn] :8080 occupied but /health failed; starting BFF anyway" -ForegroundColor Yellow
  }
  # Use venv python -m uvicorn. Avoid --reload on Windows: the reloader child
  # often respawns under Anaconda/system Python and serves a stale package.
  $bffCmd = "& '$apiPython' -m uvicorn start_api.main:app --host 127.0.0.1 --port 8080"
  Write-Host "[start] BFF :8080" -ForegroundColor Cyan
  Start-DevService -Name "bff" -Port 8080 -Title "StarT BFF :8080" `
    -WorkingDirectory $ApiDir -Command $bffCmd
}

# --- Web ---
if ((Test-PortListening 3000) -and (Test-HttpOk "http://127.0.0.1:3000/")) {
  Write-Host "[ok]   Web already on :3000" -ForegroundColor DarkYellow
} else {
  if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
    throw "Web node_modules missing. Run: cd apps\web; npm install"
  }
  if (Test-PortListening 3000) {
    Write-Host "[warn] :3000 occupied but Web not responding; starting anyway" -ForegroundColor Yellow
  }
  Write-Host "[start] Web :3000" -ForegroundColor Cyan
  Start-DevService -Name "web" -Port 3000 -Title "StarT Web :3000" `
    -WorkingDirectory $WebDir -Command "npm run dev"
}

Write-Host ""
if ($Mode -eq "Window") {
  Write-Host "Opened service windows. When ready:" -ForegroundColor Green
} else {
  Write-Host "Started in background (no consoles). When ready:" -ForegroundColor Green
  Write-Host "  Logs:   $LogDir" -ForegroundColor DarkGray
}
Write-Host "  Web     http://127.0.0.1:3000"
Write-Host "  BFF     http://127.0.0.1:8080/api/v1/health"
Write-Host "  MinerU  http://127.0.0.1:8000/docs"
Write-Host ""
Write-Host "Stop all:  .\scripts\dev-down.ps1" -ForegroundColor DarkGray
