# 生成安卓 App 图标（从 public/icons/icon-512.png）
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root 'public\icons\icon-512.png'
$res = Join-Path $root 'capacitor-app\android\app\src\main\res'
if (-not (Test-Path $srcPath)) { throw 'source icon not found: ' + $srcPath }

function Save-Png([System.Drawing.Image]$src, [string]$outPath, [int]$size, [double]$foregroundScale) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($foregroundScale -gt 0) {
    $d = [int]($size * $foregroundScale)
    $x = [int](($size - $d) / 2)
    $g.DrawImage($src, $x, $x, $d, $d)
  } else {
    $g.DrawImage($src, 0, 0, $size, $size)
  }
  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$src = [System.Drawing.Image]::FromFile($srcPath)
$launcherSizes = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
$fgSizes = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
foreach ($d in $launcherSizes.Keys) {
  $dir = Join-Path $res ("mipmap-" + $d)
  Save-Png $src (Join-Path $dir 'ic_launcher.png') $launcherSizes[$d] 0
  Save-Png $src (Join-Path $dir 'ic_launcher_round.png') $launcherSizes[$d] 0
}
foreach ($d in $fgSizes.Keys) {
  $dir = Join-Path $res ("mipmap-" + $d)
  Save-Png $src (Join-Path $dir 'ic_launcher_foreground.png') $fgSizes[$d] 0.62
}
# 启动图：粉色底 + 居中图标
$splash = New-Object System.Drawing.Bitmap(1024, 1024)
$g = [System.Drawing.Graphics]::FromImage($splash)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#FFF0F3'))
$d = 460
$g.DrawImage($src, [int]((1024 - $d) / 2), [int]((1024 - $d) / 2), $d, $d)
$g.Dispose()
$splash.Save((Join-Path $res 'drawable\splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$splash.Dispose()
$src.Dispose()
Write-Output 'app icons generated'