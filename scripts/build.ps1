$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'manifest.json') | ConvertFrom-Json
$version = $manifest.version

$buildDir = Join-Path $root 'build'
$stage = Join-Path $buildDir 'stage'
$zipPath = Join-Path $buildDir "md-reader-$version.zip"

if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

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
  }
}

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Host "Built $zipPath"
