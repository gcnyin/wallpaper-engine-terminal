<#
.SYNOPSIS
  Copies this wallpaper into Wallpaper Engine's local projects folder.

.DESCRIPTION
  Wallpaper Engine picks up local projects from
  <wallpaper_engine>\projects\myprojects\<name>. This script finds the
  installation (Steam library scan + config.json), copies only the runtime
  files, and optionally opens the wallpaper right away.

.EXAMPLE
  pwsh -File tools/install-wallpaper.ps1

.EXAMPLE
  pwsh -File tools/install-wallpaper.ps1 -Launch
#>
[CmdletBinding()]
param(
  [string]$WallpaperEnginePath = '',
  [string]$DestinationName = 'phosphor-terminal',
  [switch]$Launch,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Find-WallpaperEngine {
  param([string]$Hint)

  if ($Hint) {
    if (Test-Path (Join-Path $Hint 'wallpaper64.exe')) { return $Hint }
    throw "No wallpaper64.exe in '$Hint'."
  }

  $candidates = New-Object System.Collections.Generic.List[string]
  $steamPath = (Get-ItemProperty -Path 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
  if ($steamPath) {
    $steamPath = $steamPath -replace '/', '\'
    $candidates.Add((Join-Path $steamPath 'steamapps\common\wallpaper_engine'))
    $vdf = Join-Path $steamPath 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
      Select-String -Path $vdf -Pattern '"path"\s+"(.+)"' | ForEach-Object {
        $library = $_.Matches[0].Groups[1].Value -replace '\\\\', '\'
        $candidates.Add((Join-Path $library 'steamapps\common\wallpaper_engine'))
      }
    }
  }
  $candidates.Add('C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine')

  foreach ($candidate in $candidates) {
    $config = Join-Path $candidate 'config.json'
    if (Test-Path $config) {
      try {
        $install = (Get-Content $config -Raw | ConvertFrom-Json).'?installdirectory'
        if ($install -and (Test-Path (Join-Path $install 'wallpaper64.exe'))) { return $install -replace '/', '\' }
      } catch { }
      if (Test-Path (Join-Path $candidate 'wallpaper64.exe')) { return $candidate }
    }
  }

  throw 'Wallpaper Engine was not found. Pass -WallpaperEnginePath "D:\...\wallpaper_engine".'
}

$we = Find-WallpaperEngine -Hint $WallpaperEnginePath
$destination = Join-Path $we "projects\myprojects\$DestinationName"

Write-Host "Wallpaper Engine : $we"
Write-Host "Destination      : $destination"

if ($DryRun) {
  Write-Host 'Dry run — nothing copied.' -ForegroundColor Yellow
  exit 0
}

# Only ship what the wallpaper runtime needs. Dev docs, tooling and git data
# stay out of the Wallpaper Engine project folder.
$excludeDirs = @('.git', '.github', 'docs', 'tools', 'node_modules', 'assets-src')
$excludeFiles = @('*.md', '.gitattributes', '.gitignore', 'package.json', 'package-lock.json')
if (Test-Path $destination) {
  Get-ChildItem $destination -Force | Where-Object { $_.Name -notin @('.git') } | Remove-Item -Recurse -Force
} else {
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
}

$copyArgs = @($projectRoot, $destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
if ($excludeDirs.Count -gt 0) { $copyArgs += '/XD'; $copyArgs += $excludeDirs }
if ($excludeFiles.Count -gt 0) { $copyArgs += '/XF'; $copyArgs += $excludeFiles }
& robocopy @copyArgs | Out-Null
$code = $LASTEXITCODE
if ($code -ge 8) { throw "robocopy failed with exit code $code" }

$projectJson = Join-Path $destination 'project.json'
if (-not (Test-Path $projectJson)) { throw "project.json missing in $destination — run 'npm run gen' first." }

Write-Host 'Copied. Open Wallpaper Engine -> Installed -> Local to preview it.' -ForegroundColor Green

if ($Launch) {
  Write-Host 'Opening wallpaper...'
  Start-Process -FilePath (Join-Path $we 'wallpaper64.exe') -ArgumentList @(
    '-control', 'openWallpaper', '-file', $projectJson
  )
}
