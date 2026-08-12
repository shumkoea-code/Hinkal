<#
.SYNOPSIS
  System State backup (AD / critical roles).
.EXAMPLE
  .\Backup-SystemState.ps1 -BackupTarget "E:\Backups"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupTarget
)

$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run as Administrator"
}

New-Item -ItemType Directory -Force -Path $BackupTarget | Out-Null
$args = @("start","systemstatebackup","-backupTarget:$BackupTarget","-quiet")
Write-Host "wbadmin $($args -join ' ')"
$p = Start-Process -FilePath "wbadmin.exe" -ArgumentList $args -Wait -PassThru -NoNewWindow
if ($p.ExitCode -ne 0) { throw "systemstatebackup failed: $($p.ExitCode)" }
Write-Host "OK"
