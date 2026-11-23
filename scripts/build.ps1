$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'manifest.json') | ConvertFrom-Json
$version = $manifest.version

$buildDir = Join-Path $root 'build'
$stage = Join-Path $buildDir 'stage'
$zipPath = Join-Path $buildDir "md-reader-$version.zip"
$winStage = Join-Path $buildDir 'stage-windows'
$winZip = Join-Path $buildDir "md-reader-$version-windows.zip"

foreach ($path in @($stage, $winStage)) {
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
foreach ($path in @($zipPath, $winZip)) {
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path $winStage -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $winStage 'payload') -Force | Out-Null

$items = @(
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'shared.js',
  'lib',
  'popup',
  'reader',
  'README.md'
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination $stage -Recurse -Force
    Copy-Item -LiteralPath $source -Destination (Join-Path $winStage 'payload') -Recurse -Force
  }
}

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -CompressionLevel Optimal

Copy-Item -LiteralPath (Join-Path $root 'installers\windows\install.ps1') -Destination $winStage -Force
Copy-Item -LiteralPath (Join-Path $root 'installers\README.md') -Destination (Join-Path $winStage 'README.md') -Force
Compress-Archive -Path (Join-Path $winStage '*') -DestinationPath $winZip -CompressionLevel Optimal

Remove-Item -LiteralPath $stage -Recurse -Force
Remove-Item -LiteralPath $winStage -Recurse -Force

Write-Host "Built $zipPath"
Write-Host "Built $winZip"
