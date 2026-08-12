<#
.SYNOPSIS
  Lightweight Active Directory account export (users/groups) — low load, small size.

.DESCRIPTION
  Exports AD users and groups to CSV (+ optional LDIF) without System State / NTDS.dit.
  Suitable for inventory, attribute recovery, and audit — NOT a full DC restore.

  Prefer off-peak hours. Uses page size / server-side filter to limit LDAP load.
  Does not copy password hashes (by design; use System State / IFM for that).

.EXAMPLE
  .\Backup-ADAccounts.ps1 -OutDir "E:\Backups\AD-light"
  .\Backup-ADAccounts.ps1 -OutDir "\\NAS\ad-export" -IncludeGroups -Ldif
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutDir,

  [string]$SearchBase,

  [switch]$IncludeGroups,

  [switch]$IncludeComputers,

  [switch]$Ldif,

  [int]$PageSize = 500,

  [int]$Keep = 14
)

$ErrorActionPreference = "Stop"

function Require-Module([string]$Name) {
  if (-not (Get-Module -ListAvailable -Name $Name)) {
    throw "Module $Name not found. Install RSAT AD Tools / run on a DC or management host."
  }
  Import-Module $Name -ErrorAction Stop
}

Require-Module ActiveDirectory

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $OutDir "ad-accounts-$stamp"
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$common = @{
  ResultPageSize = $PageSize
  ErrorAction    = "Stop"
}
if ($SearchBase) { $common["SearchBase"] = $SearchBase }

Write-Host "[*] Exporting users -> $dest"
$userProps = @(
  "SamAccountName", "UserPrincipalName", "DisplayName", "GivenName", "Surname",
  "Enabled", "DistinguishedName", "MemberOf", "mail", "telephoneNumber",
  "Title", "Department", "Company", "whenCreated", "whenChanged",
  "PasswordLastSet", "LastLogonDate", "AccountExpirationDate",
  "employeeID", "description", "proxyAddresses"
)
$users = Get-ADUser @common -Filter * -Properties $userProps

$users | Select-Object `
  SamAccountName, UserPrincipalName, DisplayName, GivenName, Surname, `
  Enabled, DistinguishedName, @{n = "MemberOf"; e = { ($_.MemberOf -join ";") } }, `
  mail, telephoneNumber, Title, Department, Company, `
  whenCreated, whenChanged, PasswordLastSet, LastLogonDate, AccountExpirationDate, `
  employeeID, description, `
  @{n = "proxyAddresses"; e = { ($_.proxyAddresses -join ";") } } |
  Export-Csv -Path (Join-Path $dest "users.csv") -NoTypeInformation -Encoding UTF8

Write-Host "[*] users count=$($users.Count)"

if ($IncludeGroups) {
  Write-Host "[*] Exporting groups"
  $groupProps = @(
    "SamAccountName", "GroupCategory", "GroupScope", "DistinguishedName",
    "Description", "whenCreated", "whenChanged", "Members"
  )
  $groups = Get-ADGroup @common -Filter * -Properties $groupProps
  $groups | Select-Object `
    SamAccountName, GroupCategory, GroupScope, DistinguishedName, Description, `
    whenCreated, whenChanged, `
    @{n = "Members"; e = { ($_.Members -join ";") } } |
    Export-Csv -Path (Join-Path $dest "groups.csv") -NoTypeInformation -Encoding UTF8
  Write-Host "[*] groups count=$($groups.Count)"
}

if ($IncludeComputers) {
  Write-Host "[*] Exporting computers"
  $compProps = @(
    "SamAccountName", "DNSHostName", "Enabled", "OperatingSystem",
    "DistinguishedName", "whenCreated", "whenChanged", "LastLogonDate"
  )
  $computers = Get-ADComputer @common -Filter * -Properties $compProps
  $computers | Select-Object `
    SamAccountName, DNSHostName, Enabled, OperatingSystem, `
    DistinguishedName, whenCreated, whenChanged, LastLogonDate |
    Export-Csv -Path (Join-Path $dest "computers.csv") -NoTypeInformation -Encoding UTF8
  Write-Host "[*] computers count=$($computers.Count)"
}

if ($Ldif) {
  # Optional: ldifde is available on DCs; skip silently if missing
  $ldifde = Get-Command ldifde.exe -ErrorAction SilentlyContinue
  if ($ldifde) {
    Write-Host "[*] LDIF via ldifde (users)"
    $ldifPath = Join-Path $dest "users.ldf"
    $filter = "(objectCategory=person)"
    $args = @("-f", $ldifPath, "-r", $filter, "-l", "dn,cn,sAMAccountName,userPrincipalName,mail,memberOf")
    if ($SearchBase) { $args += @("-d", $SearchBase) }
    & ldifde.exe @args | Out-Null
  }
  else {
    Write-Warning "ldifde.exe not found — skipped LDIF"
  }
}

# META
@"
stamp=$stamp
host=$env:COMPUTERNAME
domain=$(try { (Get-ADDomain).DNSRoot } catch { "" })
mode=ad-accounts-light
note=No password hashes. For full AD restore use System State or IFM.
"@ | Set-Content -Path (Join-Path $dest "META.txt") -Encoding UTF8

# Zip for transfer (small)
$zip = Join-Path $OutDir "ad-accounts-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $dest -DestinationPath $zip -CompressionLevel Optimal
Get-FileHash -Algorithm SHA256 $zip |
  ForEach-Object { "$($_.Hash.ToLower())  $(Split-Path $_.Path -Leaf)" } |
  Set-Content -Path "$zip.sha256" -Encoding ASCII

Remove-Item -Recurse -Force $dest

# Retention
Get-ChildItem $OutDir -Filter "ad-accounts-*.zip" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep |
  ForEach-Object {
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    Remove-Item "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
  }

Write-Host "[OK] $zip"
Write-Output $zip
