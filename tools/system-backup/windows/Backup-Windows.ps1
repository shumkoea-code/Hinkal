<#
.SYNOPSIS
  Backup volumes via Windows Server Backup (wbadmin).
.EXAMPLE
  .\Backup-Windows.ps1 -BackupTarget "E:\Backups" -Volumes "C:","D:" -IncludeSystemState -Keep 7
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupTarget,
  [string[]]$Volumes = @("C:"),
  [switch]$IncludeSystemState,
  [int]$Keep = 7
)

$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run as Administrator"
}

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logDir = Join-Path $BackupTarget "logs"
New-Item -ItemType Directory -Force -Path $BackupTarget, $logDir | Out-Null
$log = Join-Path $logDir "backup-$stamp.log"

function Write-Log([string]$m) {
  $line = "[{0}] {1}" -f (Get-Date -Format "o"), $m
  Add-Content -Path $log -Value $line
  Write-Host $line
}

Write-Log "START target=$BackupTarget volumes=$($Volumes -join ',') systemState=$IncludeSystemState"

# wbadmin wants backupTarget as disk letter or UNC share path
$include = ($Volumes | ForEach-Object { $_.TrimEnd('\') }) -join ","
$args = @("start","backup","-backupTarget:$BackupTarget","-include:$include","-quiet")
if ($IncludeSystemState) { $args += "-allCritical" }

Write-Log "wbadmin $($args -join ' ')"
$p = Start-Process -FilePath "wbadmin.exe" -ArgumentList $args -Wait -PassThru -NoNewWindow
Write-Log "wbadmin exit=$($p.ExitCode)"
if ($p.ExitCode -ne 0) { throw "wbadmin failed: $($p.ExitCode)" }

# Rotation of dated side folders if any custom copies exist; wbadmin manages its catalog itself.
# Additionally prune old log files
Get-ChildItem $logDir -Filter "backup-*.log" | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip ([Math]::Max($Keep * 3, 10)) | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Log "OK"
exit 0
