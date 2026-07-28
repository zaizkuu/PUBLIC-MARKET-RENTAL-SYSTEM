param(
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Dest,
  [int]$Size = 512
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source).Path)
try {
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Circular clip so the seal's black square corners become transparent.
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $Size, $Size)
    $g.SetClip($path)

    # cover-fit the source into the square
    $scale = [Math]::Max($Size / $src.Width, $Size / $src.Height)
    $w = $src.Width * $scale
    $h = $src.Height * $scale
    $g.DrawImage($src, [float](($Size - $w) / 2), [float](($Size - $h) / 2), [float]$w, [float]$h)

    $path.Dispose()
  } finally {
    $g.Dispose()
  }

  $destDir = Split-Path -Parent $Dest
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
  $bmp.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()

  $info = Get-Item $Dest
  Write-Output "source: $($src.Width)x$($src.Height)"
  Write-Output "wrote:  $Dest  ($($Size)x$($Size), $([Math]::Round($info.Length/1KB,1)) KB)"
} finally {
  $src.Dispose()
}
