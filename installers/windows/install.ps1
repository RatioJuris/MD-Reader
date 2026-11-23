[CmdletBinding()]
param(
  [string]$Prefix,
  [ValidateSet('chrome', 'edge', 'chromium', 'firefox')]
  [string]$Browser = 'chrome',
  [string]$Source,
  [switch]$NoAssociate,
  [switch]$OpenBrowser,
  [switch]$DryRun,
  [switch]$Uninstall,
  [switch]$Verify,
  [switch]$Json,
  [string]$Log
)

$ErrorActionPreference = 'Stop'

$changes = @()
$warnings = @()
$manualSteps = @()
$verifiedFiles = 0
$exitCode = 0
$status = 'ok'
$action = 'install'
$installRoot = ''
$extensionDir = ''
$scriptDir = $PSScriptRoot

function Say([string]$message) {
  if ($Json) {
    [Console]::Error.WriteLine($message)
  } else {
    Write-Host $message
  }
  if ($Log) { Add-Content -LiteralPath $Log -Value $message }
}

function JsonString([string]$value) {
  $escaped = $value -replace '\\', '\\'
  $escaped = $escaped -replace '"', '\"'
  $escaped = $escaped -replace "`r", ''
  $escaped = $escaped -replace "`n", ' '
  return '"' + $escaped + '"'
}

function JsonArray($items) {
  if (-not $items -or $items.Count -eq 0) { return '[]' }
  $parts = @()
  foreach ($item in $items) { $parts += JsonString ([string]$item) }
  return '[' + ($parts -join ',') + ']'
}

function Emit() {
  if ($Json) {
    $line = '{' +
      '"status":' + (JsonString $status) + ',' +
      '"action":' + (JsonString $action) + ',' +
      '"platform":"windows",' +
      '"browser":' + (JsonString $Browser) + ',' +
      '"prefix":' + (JsonString $installRoot) + ',' +
      '"extension_dir":' + (JsonString $extensionDir) + ',' +
      '"dry_run":' + ($DryRun.IsPresent.ToString().ToLowerInvariant()) + ',' +
      '"verified_files":' + $verifiedFiles + ',' +
      '"exit_code":' + $exitCode + ',' +
      '"changes":' + (JsonArray $changes) + ',' +
      '"warnings":' + (JsonArray $warnings) + ',' +
      '"manual_steps":' + (JsonArray $manualSteps) +
      '}'
    Write-Output $line
  } else {
    Say ("MD Reader {0} - {1}" -f $action, $status)
    Say ("Browser: {0}" -f $Browser)
    Say ("Prefix: {0}" -f $installRoot)
    foreach ($item in $changes) { Say ("  + " + $item) }
    foreach ($item in $warnings) { Say ("  ! " + $item) }
    foreach ($item in $manualSteps) { Say ("  > " + $item) }
  }
}

function Get-BrowserExecutable([string]$name) {
  $pf = $env:ProgramFiles
  $pf86 = ${env:ProgramFiles(x86)}
  $local = $env:LOCALAPPDATA
  $candidates = @()

  switch ($name) {
    'chrome' {
      if ($pf) { $candidates += (Join-Path $pf 'Google\Chrome\Application\chrome.exe') }
      if ($pf86) { $candidates += (Join-Path $pf86 'Google\Chrome\Application\chrome.exe') }
      if ($local) { $candidates += (Join-Path $local 'Google\Chrome\Application\chrome.exe') }
    }
    'edge' {
      if ($pf86) { $candidates += (Join-Path $pf86 'Microsoft\Edge\Application\msedge.exe') }
      if ($pf) { $candidates += (Join-Path $pf 'Microsoft\Edge\Application\msedge.exe') }
    }
    'chromium' {
      if ($local) { $candidates += (Join-Path $local 'Chromium\Application\chrome.exe') }
      if ($pf) { $candidates += (Join-Path $pf 'Chromium\Application\chrome.exe') }
    }
    'firefox' {
      if ($pf) { $candidates += (Join-Path $pf 'Mozilla Firefox\firefox.exe') }
      if ($pf86) { $candidates += (Join-Path $pf86 'Mozilla Firefox\firefox.exe') }
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Get-BrowserUrl([string]$name) {
  if ($name -eq 'firefox') { return 'about:debugging#/runtime/this-firefox' }
  return 'chrome://extensions'
}

$expectedFiles = @(
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'shared.js',
  'lib/marked.min.js',
  'lib/purify.min.js',
  'lib/LICENSE-marked.txt',
  'lib/LICENSE-dompurify.txt',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'reader/reader.html',
  'reader/reader.css',
  'reader/reader.js',
  'README.md'
)

try {
  if (-not $Prefix) {
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is not set; pass -Prefix explicitly.' }
    $Prefix = Join-Path $env:LOCALAPPDATA 'MD-Reader'
  }
  $installRoot = $Prefix
  $extensionDir = Join-Path $installRoot 'extension'
  $statePath = Join-Path $installRoot 'state.json'

  if (-not $Source) {
    $payload = Join-Path $scriptDir 'payload'
    if (Test-Path -LiteralPath $payload) {
      $Source = $payload
    } else {
      $repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
      if (Test-Path -LiteralPath (Join-Path $repoRoot 'manifest.json')) {
        $Source = $repoRoot
      } else {
        throw 'Cannot locate extension payload. Pass -Source or package install.ps1 with a payload folder.'
      }
    }
  }

  if ($Uninstall) {
    $action = 'uninstall'
    $progid = "MDReader.Markdown.$Browser"
    if (Test-Path -LiteralPath $statePath) {
      $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
      if ($saved.browser) { $progid = "MDReader.Markdown.$($saved.browser)" }
    }
    if (-not $DryRun) {
      Remove-Item -Path "HKCU:\Software\Classes\$progid" -Recurse -Force -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path 'HKCU:\Software\Classes\.md\OpenWithProgids' -Name $progid -Force -ErrorAction SilentlyContinue
      Remove-Item -Path 'HKCU:\Software\Classes\MIME\Database\Content Type\text/markdown' -Recurse -Force -ErrorAction SilentlyContinue
      if (Test-Path -LiteralPath $installRoot) {
        Remove-Item -LiteralPath $installRoot -Recurse -Force
        $changes += "Removed $installRoot"
      }
      $changes += 'Removed MD Reader file-association registration'
    } else {
      $changes += "Would remove $installRoot"
      $changes += 'Would remove MD Reader file-association registration'
    }
    $warnings += 'Default app choice was left untouched; Windows controls that through Settings.'
    Emit
    exit $exitCode
  }

  if ($Verify) {
    $action = 'verify'
    if (-not (Test-Path -LiteralPath $statePath)) { throw "No MD Reader installation found at $installRoot" }
    $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if (-not $saved.files) { throw 'Installation state has no file manifest.' }

    foreach ($entry in $saved.files.PSObject.Properties) {
      $relative = $entry.Name -replace '/', '\'
      $filePath = Join-Path $extensionDir $relative
      if (-not (Test-Path -LiteralPath $filePath)) {
        $warnings += "Missing: $relative"
        continue
      }
      $actual = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actual -ne [string]$entry.Value) {
        $warnings += "Changed: $relative"
      } else {
        $verifiedFiles += 1
      }
    }
    if ($warnings.Count -gt 0) {
      $status = 'error'
      $exitCode = 4
    }
    Emit
    exit $exitCode
  }

  $fileHashes = @{}
  foreach ($relative in $expectedFiles) {
    $sourcePath = Join-Path $Source ($relative -replace '/', '\')
    if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing source file: $relative" }
    if (-not $DryRun) {
      $destination = Join-Path $extensionDir ($relative -replace '/', '\')
      $destinationDir = Split-Path -Parent $destination
      New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
      Copy-Item -LiteralPath $sourcePath -Destination $destination -Force
      $fileHashes[$relative] = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  $changes += "Staged $($expectedFiles.Count) extension files"
  if (-not $DryRun) { $changes += "Wrote $statePath" }

  $browserExe = Get-BrowserExecutable $Browser
  $browserUrl = Get-BrowserUrl $Browser
  $progid = "MDReader.Markdown.$Browser"

  if (-not $NoAssociate) {
    if (-not $browserExe) {
      $warnings += "Could not find $Browser executable; file association was skipped."
    } elseif ($DryRun) {
      $changes += "Would register $progid as an Open with handler for .md"
    } else {
      $classKey = "HKCU:\Software\Classes\$progid"
      $commandKey = "$classKey\shell\open\command"
      New-Item -Path $commandKey -Force | Out-Null
      Set-Item -Path $classKey -Value 'MD Reader Markdown Document'
      Set-ItemProperty -Path $classKey -Name 'FriendlyTypeName' -Value 'MD Reader Markdown Document' -Force
      Set-Item -Path $commandKey -Value ('"' + $browserExe + '" "%1"')

      $openWith = 'HKCU:\Software\Classes\.md\OpenWithProgids'
      New-Item -Path $openWith -Force | Out-Null
      New-ItemProperty -Path $openWith -Name $progid -Value '' -PropertyType String -Force | Out-Null

      $mimeKey = 'HKCU:\Software\Classes\MIME\Database\Content Type\text/markdown'
      New-Item -Path $mimeKey -Force | Out-Null
      New-ItemProperty -Path $mimeKey -Name 'Extension' -Value '.md' -PropertyType String -Force | Out-Null

      $changes += "Registered $progid as an Open with handler for .md"
    }
  }

  if (-not $DryRun) {
    $state = [ordered]@{
      schema = 1
      action = 'install'
      browser = $Browser
      installed_at = (Get-Date).ToUniversalTime().ToString('o')
      source = $Source
      extension_dir = $extensionDir
      association = @{ progid = $progid; enabled = (-not $NoAssociate) }
      files = $fileHashes
    }
    Set-Content -LiteralPath $statePath -Value ($state | ConvertTo-Json -Depth 8) -Encoding UTF8
  }

  $manualSteps += "Open $browserUrl, enable Developer mode, choose Load unpacked, and select $extensionDir"
  if (-not $NoAssociate) {
    $manualSteps += 'If you want MD Reader as the default for .md, choose it in Settings > Apps > Default apps > Choose default apps by file type.'
  }
  $manualSteps += 'In the extension details, enable Allow access to file URLs to render local files in place.'

  if ($OpenBrowser -and $browserExe -and -not $DryRun) {
    Start-Process -FilePath $browserExe -ArgumentList $browserUrl | Out-Null
    $changes += "Opened $Browser at $browserUrl"
  }

  Emit
  exit $exitCode
} catch {
  $status = 'error'
  $exitCode = 1
  $warnings += $_.Exception.Message
  Emit
  exit $exitCode
}
