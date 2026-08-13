# 生成安卓 App 图标：粉色渐变底 + 爱心屋顶小屋
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'capacitor-app\android\app\src\main\res'
$outDir = Join-Path $root 'shots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$PINK1 = [System.Drawing.Color]::FromArgb(255, 255, 167, 196)
$PINK2 = [System.Drawing.Color]::FromArgb(255, 249, 93, 143)
$ROSE  = [System.Drawing.Color]::FromArgb(255, 255, 143, 171)
$DEEPROSE = [System.Drawing.Color]::FromArgb(255, 251, 111, 146)

function New-HeartPath([float]$cx, [float]$cy, [float]$s) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $p.AddBezier($cx, $cy + 0.85*$s, $cx - 0.95*$s, $cy + 0.30*$s, $cx - 0.85*$s, $cy - 0.60*$s, $cx, $cy - 0.35*$s)
  $p.AddBezier($cx, $cy - 0.35*$s, $cx + 0.85*$s, $cy - 0.60*$s, $cx + 0.95*$s, $cy + 0.30*$s, $cx, $cy + 0.85*$s)
  return $p
}
function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = 2*$r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x+$w-$d, $y, $d, $d, 270, 90)
  $p.AddArc($x+$w-$d, $y+$h-$d, $d, $d, 0, 90)
  $p.AddArc($x, $y+$h-$d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}
function New-ArchedDoorPath([float]$x, [float]$y, [float]$w, [float]$h) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $p.AddArc($x, $y, $w, $w, 180, 180)
  $p.AddLine($x+$w, $y + $w/2, $x+$w, $y+$h)
  $p.AddLine($x+$w, $y+$h, $x, $y+$h)
  $p.AddLine($x, $y+$h, $x, $y + $w/2)
  $p.CloseFigure()
  return $p
}

function Draw-HouseElements($g) {
  $sh = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(45, 130, 60, 85))
  $g.FillEllipse($sh, 295, 665, 210, 26)
  $heart = New-HeartPath 400 320 205
  $hb = [System.Drawing.Drawing2D.LinearGradientBrush]::new(([System.Drawing.RectangleF]::new(180, 100, 440, 440)), $ROSE, $DEEPROSE, 90)
  $g.FillPath($hb, $heart)
  $hl = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
  $g.FillEllipse($hl, 268, 158, 110, 90)
  $body = New-RoundedRectPath 268 430 264 262 56
  $g.FillPath(([System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)), $body)
  $door = New-ArchedDoorPath 360 552 80 140
  $g.FillPath(([System.Drawing.SolidBrush]::new($DEEPROSE)), $door)
  $knob = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
  $g.FillEllipse($knob, 418, 620, 12, 12)
  $h1 = New-HeartPath 200 700 42
  $g.FillPath(([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 255, 143, 171))), $h1)
  $h2 = New-HeartPath 600 700 42
  $g.FillPath(([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 255, 143, 171))), $h2)
}

function New-Canvas([int]$size) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return @($bmp, $g)
}

function Draw-Background($g, [int]$size) {
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(([System.Drawing.RectangleF]::new(0, 0, $size, $size)), $PINK1, $PINK2, 90)
  $g.FillRectangle($bg, 0, 0, $size, $size)
  $c1 = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $c1.AddEllipse(([System.Drawing.RectangleF]::new(-0.22*$size, -0.28*$size, 0.9*$size, 0.9*$size)))
  $pb1 = [System.Drawing.Drawing2D.PathGradientBrush]::new($c1)
  $pb1.CenterColor = [System.Drawing.Color]::FromArgb(110, 255, 255, 255)
  $pb1.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
  $g.FillPath($pb1, $c1)
  $c2 = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $c2.AddEllipse(([System.Drawing.RectangleF]::new(0.5*$size, 0.55*$size, 0.95*$size, 0.95*$size)))
  $pb2 = [System.Drawing.Drawing2D.PathGradientBrush]::new($c2)
  $pb2.CenterColor = [System.Drawing.Color]::FromArgb(80, 255, 179, 198)
  $pb2.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 179, 198))
  $g.FillPath($pb2, $c2)
}

function Save-Scaled($src, [string]$outPath, [int]$size) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$S = 1.28
$ox = 512 - 400*$S
$oy = 512 - 400*$S
foreach ($shape in @('launcher', 'round')) {
  $canvas = New-Canvas 1024
  $bmp = $canvas[0]; $g = $canvas[1]
  if ($shape -eq 'launcher') {
    $clip = New-RoundedRectPath 0 0 1024 1024 232
  } else {
    $clip = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $clip.AddEllipse(0, 0, 1024, 1024)
  }
  $g.SetClip($clip)
  Draw-Background $g 1024
  $g.TranslateTransform($ox, $oy)
  $g.ScaleTransform($S, $S)
  Draw-HouseElements $g
  $g.ResetTransform()
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

$F = 0.9
$fOx = 512 - 400*$F
$fOy = 512 - 400*$F
$canvas = New-Canvas 1024
$bmp = $canvas[0]; $g = $canvas[1]
$g.TranslateTransform($fOx, $fOy)
$g.ScaleTransform($F, $F)
Draw-HouseElements $g
$g.ResetTransform()
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
Draw-Background $g 1024
$iconSize = 460
$g.DrawImage($master, [int]((1024 - $iconSize)/2), [int]((1024 - $iconSize)/2), $iconSize, $iconSize)
$g.Dispose()
$bmp.Save((Join-Path $res 'drawable\splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $outDir 'splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$master.Dispose()
Write-Output 'splash done'

$nl = [Environment]::NewLine
$bgXml = '<?xml version="1.0" encoding="utf-8"?>' + $nl + '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">' + $nl + '    <gradient android:angle="270" android:startColor="#FFA7C4" android:endColor="#F95D8F" />' + $nl + '</shape>'
[System.IO.File]::WriteAllText((Join-Path $res 'drawable\ic_launcher_background.xml'), $bgXml, (New-Object System.Text.UTF8Encoding($false)))
foreach ($f in @('mipmap-anydpi-v26\ic_launcher.xml', 'mipmap-anydpi-v26\ic_launcher_round.xml')) {
  $p = Join-Path $res $f
  $c = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
  $c = $c.Replace('@color/ic_launcher_background', '@drawable/ic_launcher_background')
  [System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($false)))
}
Write-Output ('previews: ' + $outDir)