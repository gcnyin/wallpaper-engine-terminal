<#
.SYNOPSIS
  Opens this wallpaper in a Wallpaper Engine pop-out window (or closes it again).

.DESCRIPTION
  Uses Wallpaper Engine's documented command line interface so the real CEF
  runtime can be inspected without touching the user's desktop wallpaper.

.EXAMPLE
  pwsh -File tools/preview-wallpaper.ps1
  pwsh -File tools/preview-wallpaper.ps1 -Width 1920 -Height 1080 -Borderless
  # Hashtables must be passed by direct invocation, not through `pwsh -File`:
  ./tools/preview-wallpaper.ps1 -Properties @{ theme = 'nord'; session = 'systems' }
  pwsh -File tools/preview-wallpaper.ps1 -Close
#>
[CmdletBinding()]
param(
  [string]$WallpaperEnginePath = '',
  [string]$WindowName = 'Phosphor Preview',
  [int]$Width = 1600,
  [int]$Height = 900,
  [int]$X = 40,
  [int]$Y = 40,
  [switch]$Borderless,
  [switch]$Activate,
  [switch]$Close,
  [hashtable]$Properties
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Find-WallpaperEngine {
  param([string]$Hint)
  if ($Hint) {
    if (Test-Path (Join-Path $Hint 'wallpaper64.exe')) { return (Resolve-Path $Hint).Path }
    throw "No wallpaper64.exe in '$Hint'."
  }
  $steamPath = (Get-ItemProperty -Path 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
  $candidates = New-Object System.Collections.Generic.List[string]
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
    if (Test-Path (Join-Path $candidate 'wallpaper64.exe')) { return $candidate }
  }
  throw 'Wallpaper Engine was not found. Pass -WallpaperEnginePath "D:\...\wallpaper_engine".'
}

$we = Find-WallpaperEngine -Hint $WallpaperEnginePath
$exe = Join-Path $we 'wallpaper64.exe'
$projectJson = Join-Path $projectRoot 'project.json'

if (-not (Test-Path $projectJson)) { throw "project.json missing — run 'npm run gen' first." }

if ($Close) {
  & $exe -control removeWallpaper -location $WindowName | Out-Null
  Start-Sleep -Milliseconds 700
  # Some Wallpaper Engine builds ignore removeWallpaper for pop-out windows;
  # close the hosting window directly as a fallback.
  $hosts = Get-Process wallpaper64, wallpaper32 -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -eq $WindowName }
  foreach ($hostProcess in $hosts) {
    $hostProcess.CloseMainWindow() | Out-Null
  }
  Write-Host "Closed window '$WindowName'."
  exit 0
}

# Wallpaper Engine must already be running to receive control commands.
if (-not (Get-Process wallpaper64, wallpaper32 -ErrorAction SilentlyContinue)) {
  Write-Host 'Wallpaper Engine is not running, starting it...'
  Start-Process -FilePath $exe
  Start-Sleep -Seconds 4
}

if ($Properties -and $Properties.Count -gt 0) {
  $payload = @{}
  foreach ($key in $Properties.Keys) { $payload[$key] = @{ value = $Properties[$key] } }
  $json = $payload | ConvertTo-Json -Compress -Depth 5
  & $exe -control applyWallpaperProperties -properties ("RAW~({0})~END" -f $json) -location $WindowName
  Write-Host "Applied properties: $json"
  exit 0
}

$arguments = @('-control', 'openWallpaper', '-file', $projectJson,
  '-playInWindow', $WindowName, '-width', $Width, '-height', $Height, '-x', $X, '-y', $Y)
if ($Borderless) { $arguments += '-borderless' }
if ($Activate) { $arguments += '-activate' }

& $exe @arguments
Write-Host "Opened '$WindowName' ($Width x $Height) from $projectJson"
