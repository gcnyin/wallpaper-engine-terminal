<#
.SYNOPSIS
  Captures a window (by title) into a JPEG — used to produce preview.jpg from
  the real Wallpaper Engine renderer.

.EXAMPLE
  pwsh -File tools/preview-wallpaper.ps1 -Width 1920 -Height 1080 -Borderless -Activate
  pwsh -File tools/capture-window.ps1 -WindowName "Phosphor Preview" -Out preview.jpg
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$WindowName,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 0,
  [int]$Height = 0,
  [int]$Quality = 92
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class WinCapture {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X, Y; }

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);
}
'@

[WinCapture]::SetProcessDPIAware() | Out-Null

$handle = [WinCapture]::FindWindow($null, $WindowName)
if ($handle -eq [IntPtr]::Zero) { throw "Window '$WindowName' was not found. Is the wallpaper open?" }

[WinCapture]::SetForegroundWindow($handle) | Out-Null
Start-Sleep -Milliseconds 600

$client = New-Object WinCapture+RECT
[WinCapture]::GetClientRect($handle, [ref]$client) | Out-Null
$origin = New-Object WinCapture+POINT
[WinCapture]::ClientToScreen($handle, [ref]$origin) | Out-Null

$sourceWidth = $client.Right - $client.Left
$sourceHeight = $client.Bottom - $client.Top
if ($sourceWidth -le 0 -or $sourceHeight -le 0) { throw 'Window has no client area.' }

Write-Host "Capturing ${sourceWidth}x${sourceHeight} from '$WindowName'..."

$bitmap = New-Object System.Drawing.Bitmap($sourceWidth, $sourceHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
$ok = [WinCapture]::PrintWindow($handle, $hdc, 2) # PW_RENDERFULLCONTENT
$graphics.ReleaseHdc($hdc)
$graphics.Dispose()

if (-not $ok) {
  Write-Host 'PrintWindow failed, falling back to screen copy...' -ForegroundColor Yellow
  $bitmap.Dispose()
  $bitmap = New-Object System.Drawing.Bitmap($sourceWidth, $sourceHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, (New-Object System.Drawing.Size($sourceWidth, $sourceHeight)))
  $graphics.Dispose()
}

if ($Width -gt 0 -and $Height -gt 0 -and ($Width -ne $sourceWidth -or $Height -ne $sourceHeight)) {
  $scaled = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $scaledGraphics = [System.Drawing.Graphics]::FromImage($scaled)
  $scaledGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $scaledGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $scaledGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $scaledGraphics.DrawImage($bitmap, 0, 0, $Width, $Height)
  $scaledGraphics.Dispose()
  $bitmap.Dispose()
  $bitmap = $scaled
}

$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location).Path $Out }
$outDir = Split-Path -Parent $outPath
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
$bitmap.Save($outPath, $codec, $encoderParams)
$bitmap.Dispose()

$size = (Get-Item $outPath).Length / 1KB
Write-Host ("Saved {0} ({1:N0} KB, {2}x{3})" -f $outPath, $size, $Width, $Height) -ForegroundColor Green
