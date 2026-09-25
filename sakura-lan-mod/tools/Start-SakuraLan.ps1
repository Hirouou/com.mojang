param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$root = 'D:\SakuraLAN'
$sdk = Join-Path $root 'sdk'
$avd = Join-Path $root 'avd'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emulator = Join-Path $sdk 'emulator\emulator.exe'
$apks = Join-Path $root 'apks'
$files = @('jp.garud.ssimulator.apk', 'config.armeabi_v7a.apk', 'UnityDataAssetPack.apk') | ForEach-Object { Join-Path $apks $_ }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_AVD_HOME = $avd
if (-not (Test-Path $emulator) -or -not (Test-Path $adb)) { throw 'SDK incompleto em D:\SakuraLAN\sdk.' }
$check = & $emulator -accel-check 2>&1
if (($check -join "`n") -notmatch '(?m)^0\s*$') { throw "A aceleração do emulador não está disponível: $check" }

foreach ($spec in @(@('SakuraHost', '5554'), @('SakuraClient', '5556'))) {
    $name, $port = $spec
    if (-not ((& $adb devices) -match "emulator-$port\s+device")) {
        Start-Process -FilePath $emulator -ArgumentList @("@$name", '-port', $port, '-gpu', 'auto', '-no-snapshot', '-no-boot-anim', '-camera-back', 'none', '-camera-front', 'none')
    }
}
foreach ($port in @('5554', '5556')) {
    $serial = "emulator-$port"
    & $adb -s $serial wait-for-device | Out-Null
    $ready = $false
    for ($i = 0; $i -lt 120; $i++) {
        if ((& $adb -s $serial shell getprop sys.boot_completed 2>$null).Trim() -eq '1') { $ready = $true; break }
        Start-Sleep -Seconds 3
    }
    if (-not $ready) { throw "Inicialização demorou demais: $serial" }
}
# Test mode: block outbound ad traffic inside these AVDs while retaining UDP LAN.
foreach ($port in @('5554', '5556')) {
    $serial = "emulator-$port"
    & $adb -s $serial root | Out-Null
    & $adb -s $serial wait-for-device | Out-Null
    & $adb -s $serial shell settings put global airplane_mode_on 0 | Out-Null
    & $adb -s $serial shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false | Out-Null
    & $adb -s $serial shell svc wifi enable | Out-Null
    & $adb -s $serial shell svc data enable | Out-Null
    foreach ($rule in @(@('tcp', '80'), @('tcp', '443'), @('udp', '443'))) {
        $protocol, $webPort = $rule
        & $adb -s $serial shell iptables -C OUTPUT -p $protocol --dport $webPort -j REJECT 2>$null
        if ($LASTEXITCODE -ne 0) {
            & $adb -s $serial shell iptables -I OUTPUT 1 -p $protocol --dport $webPort -j REJECT | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Falha ao bloquear anúncios em $serial" }
        }
    }
}
if (-not $SkipInstall) {
    foreach ($file in $files) { if (-not (Test-Path $file)) { throw "Falta APK assinado: $file" } }
    foreach ($port in @('5554', '5556')) {
        & $adb -s "emulator-$port" shell am force-stop jp.garud.ssimulator | Out-Null
        & $adb -s "emulator-$port" install-multiple -r $files
        if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar APKs em emulator-$port" }
    }
}
if ((& $adb -s emulator-5554 emu redir list) -notmatch 'udp:38556') {
    & $adb -s emulator-5554 emu redir add udp:38556:38556
}
& $adb -s emulator-5554 shell am start -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity --es sakuralan_mode host --ez sakuralan_ci_pose true
& $adb -s emulator-5556 shell am start -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity --es sakuralan_mode join --es sakuralan_host 10.0.2.2 --ei sakuralan_port 38556 --ez sakuralan_ci_pose true
Write-Host 'Host e Client iniciados. Client usa 10.0.2.2:38556 via encaminhamento UDP no Host.'
Write-Host 'Para guardar telas e logs: execute Capture-SakuraLan.ps1.'
Read-Host 'Enter para fechar esta janela'
