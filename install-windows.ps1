# Run in Windows PowerShell, from this folder:
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
# Optional: -HerdrHome "C:\path\to\herdr-app" when it can't be found.
#
# Copies the herdr-board layout and its mods into Herdr's home, adds the two Ctrl+B
# keys (never replacing a key you already use), sets the terminal font to D2Coding,
# and backs up every file it changes first. Run Herdr once before this, so its home
# and keys.json exist, and keep it open while this runs (it clones Herdr's spaces mod).
param([string]$HerdrHome)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here "herdr-app"

# 1. Herdr's home: -HerdrHome, else what `herdr-app --help` prints ("Home: ..."), else the default.
if (-not $HerdrHome) {
  try {
    $help = (& herdr-app --help 2>$null) -join "`n"
    if ($help -match 'Home:\s*(\S.*?)\s*\(') { $HerdrHome = [Environment]::ExpandEnvironmentVariables($Matches[1]) }
  } catch { }
}
if (-not $HerdrHome) { $HerdrHome = Join-Path $env:USERPROFILE ".config\herdr-app" }
$HerdrHome = $HerdrHome -replace '^~', $env:USERPROFILE
if (-not (Test-Path $HerdrHome)) { throw "Herdr home not found: $HerdrHome. Start Herdr once, or pass -HerdrHome." }
Write-Host "Herdr home: $HerdrHome"
$ok = Read-Host "Install into this folder? (y/n)"
if ($ok -ne "y") { exit 1 }

# 2. Back up what will change.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $HerdrHome "backup-before-herdr-board-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
foreach ($f in @("keys.json", "settings.json", "layouts\herdr-board.json")) {
  $p = Join-Path $HerdrHome $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $backup ($f -replace '\\', '_')) }
}
foreach ($m in @("herdr-board", "my-spaces", "tab-notes", "tmux-prefix")) {
  $p = Join-Path $HerdrHome "mods\$m"
  if (Test-Path $p) { Copy-Item $p (Join-Path $backup "mods_$m") -Recurse }
}
Write-Host "Backup: $backup"

function Read-Json($path) { Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json }
function Write-Json($obj, $path) {
  $json = $obj | ConvertTo-Json -Depth 32
  [IO.File]::WriteAllText($path, $json, (New-Object Text.UTF8Encoding($false)))
}

# 3. Layout and mods.
New-Item -ItemType Directory -Force -Path (Join-Path $HerdrHome "layouts"), (Join-Path $HerdrHome "mods") | Out-Null
Copy-Item (Join-Path $src "layouts\herdr-board.json") (Join-Path $HerdrHome "layouts") -Force
foreach ($m in @("herdr-board", "tab-notes", "tmux-prefix")) {
  $dst = Join-Path $HerdrHome "mods\$m"
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  Copy-Item (Join-Path $src "mods\$m") $dst -Recurse
}
Write-Host "Copied layout herdr-board and mods herdr-board, tab-notes, tmux-prefix"

# On Windows, OpenRig and the agents run in WSL (Herdr machine "wsl"): point the board there.
$cfg = Join-Path $HerdrHome "mods\herdr-board\config.js"
$cfgText = [IO.File]::ReadAllText($cfg).Replace('export const MACHINE = null;', 'export const MACHINE = "wsl";')
[IO.File]::WriteAllText($cfg, $cfgText, (New-Object Text.UTF8Encoding($false)))
Write-Host 'herdr-board/config.js: MACHINE = "wsl"'

# my-spaces: this Herdr's own `spaces` mod, cloned here, plus the OpenRig badge and button
# (my-spaces.patch.json). Herdr's code isn't shipped in this repo. Needs Herdr open.
$mySpaces = Join-Path $HerdrHome "mods\my-spaces"
try {
  if (Test-Path $mySpaces) { Remove-Item $mySpaces -Recurse -Force }
  & herdr-app do mod.clone --name spaces --as my-spaces | Out-Null
  $mainJs = Join-Path $mySpaces "main.js"
  if (-not (Test-Path $mainJs)) { throw "mod.clone didn't create $mySpaces (is Herdr open?)" }
  $code = [IO.File]::ReadAllText($mainJs)
  $patch = Read-Json (Join-Path $src "my-spaces.patch.json")
  $missed = 0
  foreach ($e in $patch.edits) {
    $n = [regex]::Matches($code, [regex]::Escape($e.find)).Count
    if ($n -eq 1) { $code = $code.Replace($e.find, $e.replace) } else { $missed++ }
  }
  if ($missed -eq 0) {
    [IO.File]::WriteAllText($mainJs, $code, (New-Object Text.UTF8Encoding($false)))
    Write-Host "my-spaces: cloned from this Herdr's spaces and patched"
  } else {
    Write-Warning "my-spaces: this Herdr's spaces mod differs from the one the patch was made for ($missed of $($patch.edits.Count) edits didn't match). Left it unpatched: Spaces works, without the OpenRig badge and button."
  }
} catch {
  Write-Warning "my-spaces: $($_.Exception.Message). The layout needs it: open Herdr and run this again."
}

# 4. settings.json: terminal font D2Coding.
$settingsPath = Join-Path $HerdrHome "settings.json"
$settings = if (Test-Path $settingsPath) { Read-Json $settingsPath } else { [pscustomobject]@{} }
$settings | Add-Member -NotePropertyName font -NotePropertyValue "D2Coding" -Force
Write-Json $settings $settingsPath
Write-Host 'settings.json: "font": "D2Coding"'

# 5. keys.json: add Ctrl+B keys, never replacing one already bound to something else.
$keysPath = Join-Path $HerdrHome "keys.json"
if (-not (Test-Path $keysPath)) {
  Write-Warning "keys.json not found: start Herdr once, then run this again for the Ctrl+B keys."
} else {
  $keys = Read-Json $keysPath
  $add = Read-Json (Join-Path $src "keys-add.json")
  foreach ($section in $add.PSObject.Properties) {
    if (-not $keys.PSObject.Properties[$section.Name]) { $keys | Add-Member -NotePropertyName $section.Name -NotePropertyValue ([pscustomobject]@{}) }
    $target = $keys.($section.Name)
    foreach ($k in $section.Value.PSObject.Properties) {
      $have = $target.PSObject.Properties[$k.Name]
      if ($have -and $have.Value -ne $k.Value) { Write-Warning "keys.json [$($section.Name)] $($k.Name) is already '$($have.Value)'; left as is." }
      elseif (-not $have) { $target | Add-Member -NotePropertyName $k.Name -NotePropertyValue $k.Value; Write-Host "keys.json [$($section.Name)] $($k.Name) -> $($k.Value)" }
    }
  }
  Write-Json $keys $keysPath
}

# 6. Font check (installing it is up to you).
$fonts = @((Get-ItemProperty "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts" -ErrorAction SilentlyContinue).PSObject.Properties.Name) +
         @((Get-ItemProperty "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\Fonts" -ErrorAction SilentlyContinue).PSObject.Properties.Name)
if (-not ($fonts -match "D2Coding")) { Write-Warning "D2Coding font isn't installed: get it from https://github.com/naver/d2codingfont/releases and install it." }

# 7. Check the mods and show the layout.
try {
  foreach ($m in @("herdr-board", "my-spaces", "tab-notes", "tmux-prefix")) { & herdr-app check (Join-Path $HerdrHome "mods\$m") }
  & herdr-app do layout.switch --name herdr-board | Out-Null
  Write-Host "Switched Herdr to the herdr-board layout."
} catch {
  Write-Host "Open Herdr and pick the herdr-board layout (Ctrl+Shift+L)."
}
Write-Host "Done. Backup of anything replaced: $backup"
