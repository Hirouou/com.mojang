$ErrorActionPreference = 'Stop'
$adb = 'D:\SakuraLAN\sdk\platform-tools\adb.exe'
$out = Join-Path 'D:\SakuraLAN\evidence' (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force -Path $out | Out-Null
foreach ($spec in @(@('host', '5554'), @('client', '5556'))) {
    $name, $port = $spec
    $serial = "emulator-$port"
    $png = Join-Path $out "$name.png"
    $log = Join-Path $out "$name-logcat.txt"
    & $adb -s $serial shell screencap -p /sdcard/sakura-lan-screen.png | Out-Null
    & $adb -s $serial pull /sdcard/sakura-lan-screen.png $png | Out-Null
    & $adb -s $serial logcat -d -b all -v threadtime | Set-Content -Path $log -Encoding utf8
}
Write-Host "Capturas e logs: $out"
