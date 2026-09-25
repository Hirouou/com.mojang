param([ValidateSet('Host', 'Client')][string]$Instance = 'Client')
$ErrorActionPreference = 'Stop'
$adb = 'D:\SakuraLAN\sdk\platform-tools\adb.exe'
$serial = if ($Instance -eq 'Host') { 'emulator-5554' } else { 'emulator-5556' }
if (-not ((& $adb devices) -match "$serial\s+device")) {
    throw "$Instance não está aberto. Use Iniciar teste Sakura primeiro."
}
& $adb -s $serial shell am force-stop jp.garud.ssimulator
if ($Instance -eq 'Client') {
    & $adb -s $serial shell am start -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity --es sakuralan_host 10.0.2.2 --ei sakuralan_port 38556
} else {
    & $adb -s $serial shell am start -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity
}
if ($LASTEXITCODE -ne 0) { throw "Falha ao abrir SAKURA LAN em $serial" }
Write-Host "Menu SAKURA LAN aberto em $Instance."
