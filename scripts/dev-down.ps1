<#
.SYNOPSIS
  Stop StarT local dev processes (ports 8000 / 8080 / 3000 + tracked PIDs).
#>
$ErrorActionPreference = "Continue"
$PidFile = Join-Path $PSScriptRoot ".dev-pids.json"
$ports = @(8000, 8080, 3000)
$killed = @{}

function Stop-PidSafe([int]$ProcessId, [string]$Label) {
  if (-not $ProcessId -or $ProcessId -eq 0) { return }
  if ($killed.ContainsKey($ProcessId)) { return }
  try {
    $p = Get-Process -Id $ProcessId -ErrorAction Stop
    Write-Host "[stop] $Label  PID $ProcessId  ($($p.ProcessName))" -ForegroundColor Yellow
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    $killed[$ProcessId] = $true
  } catch {
    Write-Host "[warn] could not stop PID $ProcessId — $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}

# 1) PIDs recorded by dev-up (window / background wrappers)
if (Test-Path $PidFile) {
  try {
    $entries = @(Get-Content $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json)
    foreach ($e in $entries) {
      if ($null -eq $e.pid) { continue }
      Stop-PidSafe -ProcessId ([int]$e.pid) -Label "$($e.name) wrapper"
    }
  } catch {
    Write-Host "[warn] could not read $PidFile" -ForegroundColor DarkYellow
  }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# 2) Whatever is still listening on the three ports (python / node children)
foreach ($port in $ports) {
  $pids = @(
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  if (-not $pids.Count) {
    Write-Host "[ok]   :$port not listening" -ForegroundColor DarkGray
    continue
  }
  foreach ($procId in $pids) {
    Stop-PidSafe -ProcessId ([int]$procId) -Label ":$port"
  }
}

Write-Host "Done." -ForegroundColor Green
