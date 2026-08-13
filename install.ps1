$ErrorActionPreference = "Stop"

$homeDir = $env:USERPROFILE
$source = $PSScriptRoot
$pluginRoot = Join-Path $homeDir "plugins\codex-reasoning-sidebar"
$marketplacePath = Join-Path $homeDir ".agents\plugins\marketplace.json"

Write-Host "Copying plugin to $pluginRoot"
New-Item -ItemType Directory -Force -Path (Split-Path $pluginRoot -Parent) | Out-Null
if (Test-Path -LiteralPath $pluginRoot) {
  Copy-Item -Path (Join-Path $source "*") -Destination $pluginRoot -Recurse -Force
  $nested = Join-Path $pluginRoot "codex-reasoning-sidebar-plugin"
  if (Test-Path -LiteralPath $nested) {
    Remove-Item -LiteralPath $nested -Recurse -Force
  }
} else {
  Copy-Item -Path $source -Destination $pluginRoot -Recurse -Force
}

$marketplaceDir = Split-Path $marketplacePath -Parent
New-Item -ItemType Directory -Force -Path $marketplaceDir | Out-Null

if (Test-Path -LiteralPath $marketplacePath) {
  $marketplace = Get-Content -LiteralPath $marketplacePath -Raw | ConvertFrom-Json
} else {
  $marketplace = [pscustomobject]@{
    name = "personal"
    interface = @{ displayName = "Personal" }
    plugins = @()
  }
}

$exists = @($marketplace.plugins | Where-Object { $_.name -eq "codex-reasoning-sidebar" }).Count -gt 0
if (-not $exists) {
  $entry = [pscustomobject]@{
    name = "codex-reasoning-sidebar"
    source = @{ source = "local"; path = "./plugins/codex-reasoning-sidebar" }
    policy = @{ installation = "AVAILABLE"; authentication = "ON_INSTALL" }
    category = "Productivity"
  }
  $marketplace.plugins = @($marketplace.plugins) + $entry
  $json = $marketplace | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($marketplacePath, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Updated marketplace: $marketplacePath"
} else {
  Write-Host "codex-reasoning-sidebar already in marketplace."
}

$codex = Get-ChildItem (Join-Path $homeDir "AppData\Local\OpenAI\Codex\bin") -Directory |
  ForEach-Object { Join-Path $_.FullName "codex.exe" } |
  Where-Object { Test-Path $_ } |
  Sort-Object { (Get-Item $_).LastWriteTime } -Descending |
  Select-Object -First 1

if (-not $codex) {
  throw "codex.exe not found"
}

Write-Host "Installing plugin with $codex"
& $codex plugin add codex-reasoning-sidebar@personal 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "codex plugin add failed"
}

Write-Host "Done. Open a new Codex window and ask: open the Codex reasoning sidebar"
