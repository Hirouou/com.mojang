param([Parameter(Mandatory=$true)][string]$SourceDir)
$ErrorActionPreference = 'Stop'
$root = 'D:\SakuraLAN'
$adb = Join-Path $root 'sdk\platform-tools\adb.exe'
$signer = Join-Path $root 'sdk\build-tools\36.0.0\apksigner.bat'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
$names = @('jp.garud.ssimulator.apk','config.armeabi_v7a.apk','UnityDataAssetPack.apk')
$source = (Resolve-Path -LiteralPath $SourceDir).Path
foreach ($name in $names) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $name))) { throw "Falta $name" }
}
$signing = Join-Path $root 'local-test-signing'
New-Item -ItemType Directory -Force $signing | Out-Null
$key = Join-Path $signing 'sakura-local-test.p12'
if (-not (Test-Path -LiteralPath $key)) {
    & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -noprompt -keystore $key -storepass sakuralan -keypass sakuralan -alias sakuralan -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=Sakura Local Emulator Test'
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar chave de teste local' }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$staged = Join-Path $root "builds\$stamp"
New-Item -ItemType Directory -Force $staged | Out-Null
foreach ($name in $names) {
    & $signer sign --ks $key --ks-key-alias sakuralan --ks-pass pass:sakuralan --key-pass pass:sakuralan --out (Join-Path $staged $name) (Join-Path $source $name)
    if ($LASTEXITCODE -ne 0) { throw "Falha ao assinar $name" }
    & $signer verify (Join-Path $staged $name)
    if ($LASTEXITCODE -ne 0) { throw "Assinatura inválida: $name" }
}
$files = $names | ForEach-Object { Join-Path $staged $_ }
$backup = Join-Path $root "evidence\before-build-$stamp"
New-Item -ItemType Directory -Force $backup | Out-Null
foreach ($serial in @('emulator-5554','emulator-5556')) {
    & $adb -s $serial root | Out-Null
    & $adb -s $serial wait-for-device
    $booted = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if (((& $adb -s $serial shell getprop sys.boot_completed) -join '').Trim() -eq '1') { $booted = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $booted) { throw "Android ainda não inicializou: $serial" }
    & $adb -s $serial shell am force-stop jp.garud.ssimulator
    & $adb -s $serial shell tar -czf /data/local/tmp/sakura-private-backup.tgz -C /data/user/0/jp.garud.ssimulator .
    if ($LASTEXITCODE -ne 0) { throw "Backup interno falhou: $serial" }
    & $adb -s $serial shell tar -czf /data/local/tmp/sakura-external-backup.tgz -C /sdcard/Android/data/jp.garud.ssimulator .
    if ($LASTEXITCODE -ne 0) { throw "Backup externo falhou: $serial" }
    foreach ($kind in @('private','external')) {
        & $adb -s $serial pull "/data/local/tmp/sakura-$kind-backup.tgz" "$backup\$serial-$kind.tgz"
        if ($LASTEXITCODE -ne 0) { throw "Cópia do backup falhou: $serial" }
    }
    $install = & $adb -s $serial install-multiple -r $files 2>&1
    if ($LASTEXITCODE -ne 0) {
        if (($install -join "`n") -notmatch 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') { throw "$install" }
        # One migration to the persistent local certificate. Subsequent builds
        # update in place, preserving the app UID and data automatically.
        & $adb -s $serial uninstall jp.garud.ssimulator
        if ($LASTEXITCODE -ne 0) { throw 'Falha na migração do certificado' }
        & $adb -s $serial install-multiple $files
        if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar; backup salvo em $backup" }
        $appUid = ((& $adb -s $serial shell stat -c '%u' /data/user/0/jp.garud.ssimulator) -join '').Trim()
        if ($appUid -notmatch '^\d+$') { throw 'UID Android inválido' }
        # Never restore the obsolete native-library symlink or compiled caches.
        & $adb -s $serial shell tar -xzf /data/local/tmp/sakura-private-backup.tgz -C /data/user/0/jp.garud.ssimulator ./shared_prefs ./files ./databases
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao restaurar dados internos' }
        & $adb -s $serial shell chown -R "${appUid}:${appUid}" /data/user/0/jp.garud.ssimulator
        & $adb -s $serial shell restorecon -RF /data/user/0/jp.garud.ssimulator
        & $adb -s $serial shell mkdir -p /sdcard/Android/data/jp.garud.ssimulator
        & $adb -s $serial shell tar -xzf /data/local/tmp/sakura-external-backup.tgz -C /sdcard/Android/data/jp.garud.ssimulator ./files
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao restaurar dados externos' }
        & $adb -s $serial shell chown -R "${appUid}:1078" /data/media/0/Android/data/jp.garud.ssimulator
        & $adb -s $serial shell restorecon -RF /data/media/0/Android/data/jp.garud.ssimulator
    }
    Write-Host "Build instalada: $serial"
}
Copy-Item -LiteralPath $files -Destination (Join-Path $root 'apks') -Force
$hashes = ($files | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join ','
Set-Content -LiteralPath (Join-Path $root 'apks\installed-apks.sha256') -Value $hashes -Encoding ascii
Write-Host "Backups: $backup"
