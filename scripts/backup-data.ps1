<#
.SYNOPSIS
  Zip KingStar data directory (start.db, uploads, tasks, llm_settings).

.PARAMETER DataDir
  Override START_DATA_DIR. Default: env START_DATA_DIR, else services/api/.data

.PARAMETER OutDir
  Where to write the zip. Default: <repo>/backups

.EXAMPLE
  .\scripts\backup-data.ps1
  .\scripts\backup-data.ps1 -DataDir "D:\data\start"
#>
param(
  [string]$DataDir = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DefaultData = Join-Path $Root "services\api\.data"

if (-not $DataDir) {
  if ($env:START_DATA_DIR -and $env:START_DATA_DIR.Trim()) {
    $DataDir = $env:START_DATA_DIR.Trim()
  } else {
    $DataDir = $DefaultData
  }
}

if (-not (Test-Path -LiteralPath $DataDir)) {
  Write-Error "Data directory not found: $DataDir"
}

if (-not $OutDir) {
  $OutDir = Join-Path $Root "backups"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $OutDir "start-data-$stamp.zip"

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $DataDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Backup written:"
Write-Host "  $zipPath"
Write-Host "Source:"
Write-Host "  $((Resolve-Path -LiteralPath $DataDir).Path)"
Write-Host ""
Write-Host "Restore: stop BFF, extract zip over the data directory, then restart."
