# Animo installer (Windows / PowerShell 5.1+).
#
# Usage:
#   irm https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex
#   & { iwr -useb https://github.com/captaaint/animo/releases/latest/download/install.ps1 | iex } -Version <version>
#
# Parameters:
#   -Version <N.N.N>   pin a specific version (default: latest)
#   -NoVerify          skip SHA256 verification (NOT recommended)
#   -Silent            install silently (msiexec /qn); default is /qb (basic UI)
#
# The Windows desktop build is shipped as an MSI. The MSI takes care of the
# install directory, Start Menu shortcut, and uninstaller registration —
# no manual PATH editing is needed for the desktop app.

[CmdletBinding()]
param(
  [string]$Version = "",
  [switch]$NoVerify = $false,
  [switch]$Silent = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repo = "captaaint/animo"
$releaseBase = "https://github.com/$repo/releases"

function Die($msg) { Write-Error $msg; exit 1 }

if ($Version) {
  $tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
}
else {
  Write-Host "Resolving latest release tag ..."
  try {
    $resp = Invoke-RestMethod -UseBasicParsing -Uri "https://api.github.com/repos/$repo/releases/latest"
    $tag = $resp.tag_name
  } catch {
    Die "could not resolve latest tag: $($_.Exception.Message)"
  }
  if (-not $tag) { Die "GitHub API returned no tag_name" }
}
$ver = $tag.TrimStart('v')
$baseUrl = "$releaseBase/download/$tag"

$assetName = "Animo_${ver}_x64.msi"
$assetUrl = "$baseUrl/$assetName"
$sumsUrl = "$baseUrl/SHA256SUMS.txt"

$tmp = Join-Path $env:TEMP ("animo-install-" + [Guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$assetPath = Join-Path $tmp $assetName

Write-Host "Downloading $assetName ..."
try {
  Invoke-WebRequest -UseBasicParsing -Uri $assetUrl -OutFile $assetPath
} catch {
  Die "download failed: $assetUrl — $($_.Exception.Message)"
}

if (-not $NoVerify) {
  $sumsPath = Join-Path $tmp "SHA256SUMS.txt"
  Write-Host "Verifying SHA256 ..."
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $sumsUrl -OutFile $sumsPath
  } catch {
    Die "could not fetch SHA256SUMS.txt — rerun with -NoVerify to bypass."
  }

  $expected = $null
  $escaped = [Regex]::Escape($assetName)
  foreach ($line in Get-Content $sumsPath) {
    if ($line -match "^([0-9a-fA-F]{64})\s+\*?$escaped\s*$") {
      $expected = $Matches[1].ToLower()
      break
    }
  }
  if (-not $expected) { Die "no checksum entry for $assetName in SHA256SUMS.txt" }

  $actual = (Get-FileHash -Path $assetPath -Algorithm SHA256).Hash.ToLower()
  if ($expected -ne $actual) {
    Die "checksum mismatch — expected $expected, got $actual"
  }
  Write-Host "Checksum OK"
}

$uiArg = if ($Silent) { "/qn" } else { "/qb" }
$logPath = Join-Path $tmp "msi-install.log"

Write-Host "Installing Animo $ver (msiexec) ..."
$proc = Start-Process -FilePath "msiexec.exe" `
  -ArgumentList @("/i", "`"$assetPath`"", $uiArg, "/norestart", "/L*v", "`"$logPath`"") `
  -PassThru -Wait

if ($proc.ExitCode -ne 0) {
  Write-Host "msiexec log: $logPath"
  Die "msiexec failed with exit code $($proc.ExitCode)"
}

Write-Host ""
Write-Host "Installed Animo $ver."
Write-Host "Launch from the Start Menu or run: Animo"
Write-Host "Docs: https://github.com/$repo/blob/main/docs/install.md"
