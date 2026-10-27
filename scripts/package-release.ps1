$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = (Get-Content package.json | ConvertFrom-Json).version
$exe = 'src-tauri/target/release/sensor-layout-studio.exe'
if (!(Test-Path $exe)) { throw 'Run npm run tauri build first.' }
$out = 'release-artifacts'
$stage = Join-Path '.release-staging' ([guid]::NewGuid().ToString())
$portable = Join-Path $stage "SensorLayoutStudio-$version-windows-x64"
New-Item -ItemType Directory -Force -Path $out, "$portable/licenses", "$portable/examples" | Out-Null
Copy-Item $exe $portable
Copy-Item LICENSE, THIRD_PARTY_NOTICES.md, THIRD_PARTY_RUST_NOTICES.md "$portable/licenses"
Copy-Item docs/cad-runtime.md "$portable/licenses"
Copy-Item docs/licenses/* "$portable/licenses"
Copy-Item examples/* "$portable/examples"
Copy-Item docs/portable-readme.txt "$portable/README.txt"
Compress-Archive -Path $portable -DestinationPath "$out/SensorLayoutStudio-$version-windows-x64-portable.zip" -Force
$installers = @(Get-ChildItem "src-tauri/target/release/bundle/nsis/*_${version}_x64-setup.exe")
if ($installers.Count -ne 1) { throw 'Expected exactly one NSIS installer.' }
Copy-Item $installers[0].FullName "$out/SensorLayoutStudio-$version-windows-x64-setup.exe"
$sources = @{
  'occt-import-js-c2148e54b456b571238d35cac037d304053d64b2.tar.gz' = 'https://github.com/kovacsv/occt-import-js/archive/c2148e54b456b571238d35cac037d304053d64b2.tar.gz'
  'OCCT-d2abb6d844231cb8f29be6894440874a4700e4a5.tar.gz' = 'https://github.com/Open-Cascade-SAS/OCCT/archive/d2abb6d844231cb8f29be6894440874a4700e4a5.tar.gz'
}
foreach ($name in $sources.Keys) {
  Invoke-WebRequest -Uri $sources[$name] -OutFile "$out/$name"
}
Copy-Item docs/cad-runtime.md "$out/STEP-runtime-source.md"
Copy-Item LICENSE, THIRD_PARTY_NOTICES.md, THIRD_PARTY_RUST_NOTICES.md $out
Get-ChildItem $out -File | Where-Object Name -ne 'SHA256SUMS.txt' | Sort-Object Name | ForEach-Object {
  $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $($_.Name)"
} | Set-Content "$out/SHA256SUMS.txt" -Encoding ascii
Write-Output "Release files prepared in $out"
