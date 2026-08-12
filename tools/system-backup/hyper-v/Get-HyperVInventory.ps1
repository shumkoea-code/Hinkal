<#
.SYNOPSIS
  Inventory Hyper-V host and VMs.
#>
[CmdletBinding()]
param([string]$OutFile = "")

$ErrorActionPreference = "Stop"
Import-Module Hyper-V -ErrorAction Stop

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("=== Hyper-V Inventory $(Get-Date -Format o) ===")
[void]$sb.AppendLine((hostname))
[void]$sb.AppendLine("-- Switches --")
Get-VMSwitch | Format-Table Name, SwitchType, NetAdapterInterfaceDescription -AutoSize | Out-String | ForEach-Object { [void]$sb.AppendLine($_) }
[void]$sb.AppendLine("-- VMs --")
Get-VM | Select-Object Name, State, CPUUsage, MemoryAssigned, Uptime, Path, Generation, Version |
  Format-Table -AutoSize | Out-String | ForEach-Object { [void]$sb.AppendLine($_) }
[void]$sb.AppendLine("-- Hard disks --")
Get-VM | ForEach-Object {
  $vm = $_
  Get-VMHardDiskDrive -VM $vm | ForEach-Object {
    [void]$sb.AppendLine(("$($vm.Name) | $($_.Path) | $($_.DiskNumber)"))
  }
}

$text = $sb.ToString()
if ($OutFile) {
  $dir = Split-Path -Parent $OutFile
  if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Set-Content -Path $OutFile -Value $text -Encoding UTF8
  Write-Host "Wrote $OutFile"
} else {
  Write-Output $text
}
