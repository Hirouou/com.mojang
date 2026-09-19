#!/usr/bin/env bash
set -euo pipefail

OUT="sakura-lan-mod/legacy-fast/evidence"
APKDIR="sakura-lan-mod/legacy-fast/patched/signed"
mkdir -p "$OUT"

echo "=== ABI / NATIVE BRIDGE ==="
adb shell getprop ro.product.cpu.abilist | tee "$OUT/abilist.txt"
adb shell getprop ro.product.cpu.abilist32 | tee "$OUT/abilist32.txt"
adb shell getprop ro.dalvik.vm.native.bridge | tee "$OUT/native-bridge.txt"

echo "=== INSTALL LEGACY PATCHED SAKURA ==="
adb install-multiple -r   "$APKDIR/jp.garud.ssimulator.apk"   "$APKDIR/config.armeabi_v7a.apk"   "$APKDIR/UnityDataAssetPack.apk"
adb shell pm list packages | grep jp.garud.ssimulator | tee "$OUT/package.txt"

echo "=== CAPTURE LAN MENU ==="
adb logcat -c
adb shell am start -W --user 0   -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity   | tee "$OUT/lan-menu-start.txt"
sleep 4
adb exec-out screencap -p > "$OUT/lan-menu.png" || true
adb shell uiautomator dump /sdcard/lan-menu.xml >/dev/null 2>&1 || true
adb pull /sdcard/lan-menu.xml "$OUT/lan-menu.xml" >/dev/null 2>&1 || true
adb shell am force-stop --user 0 jp.garud.ssimulator

echo "=== START HOST USER 0 ==="
adb shell am start -W --user 0   -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity   --es sakuralan_mode host | tee "$OUT/host-start.txt"
sleep 20
adb exec-out screencap -p > "$OUT/host-game-screen.png" || true
adb shell uiautomator dump /sdcard/host-ui.xml >/dev/null 2>&1 || true
adb pull /sdcard/host-ui.xml "$OUT/host-ui.xml" >/dev/null 2>&1 || true
adb shell ps -A | grep jp.garud.ssimulator | tee "$OUT/processes-host.txt" || true

echo "=== CREATE CLIENT USER ==="
CREATE="$(adb shell pm create-user SakuraClient)"
echo "$CREATE" | tee "$OUT/create-user.txt"
CLIENT_USER="$(echo "$CREATE" | sed -n 's/.* id \([0-9][0-9]*\).*/\1/p')"
test -n "$CLIENT_USER"
echo "$CLIENT_USER" | tee "$OUT/client-user-id.txt"
adb shell pm install-existing --user "$CLIENT_USER" jp.garud.ssimulator
adb shell am start-user -w "$CLIENT_USER"
adb shell am switch-user "$CLIENT_USER"
sleep 3

echo "=== START CLIENT USER $CLIENT_USER ==="
adb shell am start -W --user "$CLIENT_USER"   -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity   --es sakuralan_mode join   --es sakuralan_host 127.0.0.1   --ei sakuralan_port 38556 | tee "$OUT/client-start.txt"
sleep 20
adb exec-out screencap -p > "$OUT/client-game-screen.png" || true
adb shell uiautomator dump /sdcard/client-ui.xml >/dev/null 2>&1 || true
adb pull /sdcard/client-ui.xml "$OUT/client-ui.xml" >/dev/null 2>&1 || true

adb logcat -d -v threadtime > "$OUT/logcat.txt" || true
grep 'SakuraLAN' "$OUT/logcat.txt" | tee "$OUT/sakuralan.txt" || true
grep -Ei 'FATAL EXCEPTION|SIGABRT|SIGSEGV|UnsatisfiedLinkError|pairip|pgl|integrity'   "$OUT/logcat.txt" | tee "$OUT/fatal.txt" || true
adb shell ps -A | grep jp.garud.ssimulator | tee "$OUT/processes-client.txt" || true

echo "=== SWITCH BACK TO HOST ==="
adb shell am switch-user 0
sleep 4
adb exec-out screencap -p > "$OUT/host-after-client.png" || true

echo "=== ASSERT LAN HANDSHAKE ==="
grep -q 'NET HOST OK' "$OUT/sakuralan.txt"
grep -q 'NET DIRECT JOIN OK' "$OUT/sakuralan.txt"
grep -q 'Client joined' "$OUT/sakuralan.txt"

echo "PASS: legacy Sakura host/client handshake observed"
