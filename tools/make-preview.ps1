<#
.SYNOPSIS
  Renders the wallpaper in headless Edge/Chrome and writes preview.jpg.

.DESCRIPTION
  Wallpaper Engine expects a 16:9 preview image next to project.json. Rendering
  it from the real page (instead of designing it by hand) keeps the thumbnail
  honest and makes re-shoots trivial after design changes.

.EXAMPLE
  pwsh -File tools/make-preview.ps1
  pwsh -File tools/make-preview.ps1 -Query "theme=amber&session=systems" -Width 1920 -Height 1080
#>
[CmdletBinding()]
param(
  [string]$Out = 'preview.jpg',
  [int]$Width = 1920,
  [int]$Height = 1080,
  [string]$Query = 'still=1&demo=1',
  [int]$Quality = 94,
  [int]$BudgetMs = 4000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

$browsers = @(@(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) })

if (-not $browsers) { throw 'Neither Edge nor Chrome was found.' }
$browser = $browsers[0]

$page = Join-Path $projectRoot 'index.html'
if (-not (Test-Path $page)) { throw 'index.html is missing.' }

$uri = ([System.Uri]::new($page)).AbsoluteUri
if ($Query) { $uri += '?' + $Query.TrimStart('?') }

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ('phosphor-preview-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
$png = Join-Path $temp 'shot.png'
$profile = Join-Path $temp 'profile'

try {
  $arguments = @(
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    "--window-size=$Width,$Height",
    "--user-data-dir=$profile",
    "--screenshot=$png",
    "--virtual-time-budget=$BudgetMs",
    $uri
  )

  Write-Host "Rendering $uri"
  Write-Host "Browser   $browser"
  & $browser @arguments 2>$null | Out-Null
  Start-Sleep -Milliseconds 400

  if (-not (Test-Path $png)) { throw "Headless browser did not produce a screenshot ($png)." }

  Add-Type -AssemblyName System.Drawing
  $image = [System.Drawing.Image]::FromFile($png)
  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($image, 0, 0, $Width, $Height)
  $graphics.Dispose()
  $image.Dispose()

  $outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $projectRoot $Out }
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
  $bitmap.Save($outPath, $codec, $params)
  $bitmap.Dispose()

  $sizeKb = (Get-Item $outPath).Length / 1KB
  Write-Host ("Wrote {0} ({1:N0} KB, {2}x{3})" -f $outPath, $sizeKb, $Width, $Height) -ForegroundColor Green
} finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
