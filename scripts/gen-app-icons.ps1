# Generate Android app icon: pink background + house emoji
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'capacitor-app\android\app\src\main\res'
$outDir = Join-Path $root 'shots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$PINK = [System.Drawing.Color]::FromArgb(255, 255, 143, 171)
$EMOJI = [char]::ConvertFromUtf32(0x1F3E0)  # house

function New-Canvas([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return @($bmp, $g)
}

function Save-Scaled($src, [string]$outPath, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Draw-House([System.Drawing.Graphics]$g, [int]$size) {
  $g.Clear($PINK)
  $fontSize = [int]($size * 0.66)
  $font = New-Object System.Drawing.Font('Segoe UI Emoji', $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $rect = New-Object System.Drawing.Rectangle(0, [int]($size * 0.02), $size, [int]($size * 0.98))
  $flags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor [System.Windows.Forms.TextFormatFlags]::NoPadding
  [System.Windows.Forms.TextRenderer]::DrawText($g, $EMOJI, $font, $rect, [System.Drawing.Color]::White, [System.Drawing.Color]::Transparent, $flags)
  $font.Dispose()
}

foreach ($shape in @('launcher', 'round')) {
  $canvas = New-Canvas 1024
  $bmp = $canvas[0]; $g = $canvas[1]
  if ($shape -eq 'launcher') {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddArc(0, 0, 464, 464, 180, 90)
    $clip.AddArc(560, 0, 464, 464, 270, 90)
    $clip.AddArc(560, 560, 464, 464, 0, 90)
    $clip.AddArc(0, 560, 464, 464, 90, 90)
    $clip.CloseFigure()
  } else {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddEllipse(0, 0, 1024, 1024)
  }
  $g.SetClip($clip)
  Draw-House $g 1024
  $g.Dispose()
  $masterPath = Join-Path $outDir ("master-" + $shape + ".png")
  $bmp.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $sizes = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
  foreach ($d in $sizes.Keys) {
    $suffix = $(if ($shape -eq 'round') { '_round' } else { '' })
    Save-Scaled $bmp (Join-Path $res ("mipmap-" + $d + "\ic_launcher" + $suffix + ".png")) $sizes[$d]
  }
  $bmp.Dispose()
  Write-Output ("master-" + $shape + " done")
}

$canvas = New-Canvas 1024
$bmp = $canvas[0]; $g = $canvas[1]
$g.Clear([System.Drawing.Color]::Transparent)
$fontSize = [int](1024 * 0.62)
$font = New-Object System.Drawing.Font('Segoe UI Emoji', $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$rect = New-Object System.Drawing.Rectangle(0, [int](1024 * 0.04), 1024, [int](1024 * 0.96))
$flags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor [System.Windows.Forms.TextFormatFlags]::NoPadding
[System.Windows.Forms.TextRenderer]::DrawText($g, $EMOJI, $font, $rect, [System.Drawing.Color]::White, [System.Drawing.Color]::Transparent, $flags)
$font.Dispose()
$g.Dispose()
$fgSizes = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
foreach ($d in $fgSizes.Keys) {
  Save-Scaled $bmp (Join-Path $res ("mipmap-" + $d + "\ic_launcher_foreground.png")) $fgSizes[$d]
}
$bmp.Save((Join-Path $outDir 'master-foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output 'foreground done'

$master = [System.Drawing.Image]::FromFile((Join-Path $outDir 'master-launcher.png'))
$canvas = New-Canvas 1024
$bmp = $canvas[0]; $g = $canvas[1]
$g.Clear($PINK)
$iconSize = 500
$g.DrawImage($master, [int]((1024 - $iconSize)/2), [int]((1024 - $iconSize)/2), $iconSize, $iconSize)
$g.Dispose()
$bmp.Save((Join-Path $res 'drawable\splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $outDir 'splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$master.Dispose()
Write-Output 'splash done'

$nl = [Environment]::NewLine
$bgXml = '<?xml version="1.0" encoding="utf-8"?>' + $nl + '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">' + $nl + '    <solid android:color="#FF8FAB" />' + $nl + '</shape>'
[System.IO.File]::WriteAllText((Join-Path $res 'drawable\ic_launcher_background.xml'), $bgXml, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('previews: ' + $outDir)