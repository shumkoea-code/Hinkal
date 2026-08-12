<#
.SYNOPSIS
  Export Hyper-V VMs to BackupRoot\yyyy-MM-dd\<VMName>
.EXAMPLE
  .\Backup-HyperV.ps1 -BackupRoot "E:\Backups\Hyper-V" -Keep 5
  .\Backup-HyperV.ps1 -BackupRoot "E:\Backups\Hyper-V" -VMNames @("dc01","1c-srv")
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupRoot,
  [string[]]$VMNames = @(),
  [int]$Keep = 5,
  [switch]$SkipRunningExport  # if set, skip VMs that are Running (export offline only)
)

$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run as Administrator"
}
Import-Module Hyper-V -ErrorAction Stop

$day = Get-Date -Format "yyyy-MM-dd"
$destRoot = Join-Path $BackupRoot $day
$logDir = Join-Path $BackupRoot "logs"
New-Item -ItemType Directory -Force -Path $destRoot, $logDir | Out-Null
$log = Join-Path $logDir "hyperv-$day.log"

function Write-Log([string]$m) {
  $line = "[{0}] {1}" -f (Get-Date -Format "o"), $m
  Add-Content -Path $log -Value $line
  Write-Host $line
}

$vms = if ($VMNames.Count -gt 0) {
  $VMNames | ForEach-Object { Get-VM -Name $_ }
} else {
  Get-VM
}

Write-Log "START count=$($vms.Count) dest=$destRoot"
$failed = 0

foreach ($vm in $vms) {
  if ($SkipRunningExport -and $vm.State -eq "Running") {
    Write-Log "SKIP running $($vm.Name)"
    continue
  }
  $target = Join-Path $destRoot $vm.Name
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Write-Log "EXPORT $($vm.Name) state=$($vm.State)"
  try {
    # CaptureLiveState available on modern Hyper-V; fallback without parameter if needed
    try {
      Export-VM -VM $vm -Path $destRoot -CaptureLiveState CaptureCrashConsistentState -ErrorAction Stop
    } catch {
      Write-Log "CaptureLiveState not accepted, plain Export-VM"
      Export-VM -VM $vm -Path $destRoot -ErrorAction Stop
    }
    Write-Log "OK $($vm.Name)"
  } catch {
    Write-Log "FAIL $($vm.Name): $($_.Exception.Message)"
    $failed++
  }
}

# rotate old day folders
Get-ChildItem $BackupRoot -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } |
  Sort-Object Name -Descending | Select-Object -Skip $Keep |
  ForEach-Object {
    Write-Log "ROTATE remove $($_.FullName)"
    Remove-Item -Recurse -Force $_.FullName
  }

Write-Log "DONE failed=$failed"
if ($failed -gt 0) { exit 2 }
exit 0
