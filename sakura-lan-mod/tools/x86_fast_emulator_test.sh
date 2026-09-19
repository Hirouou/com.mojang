#!/usr/bin/env bash
set -euo pipefail

OUT="sakura-lan-mod/x86-fast/evidence"
mkdir -p "$OUT"

echo "=== EMULATOR ABI ==="
adb shell getprop ro.product.cpu.abilist | tee "$OUT/abilist.txt"
adb shell getprop ro.product.cpu.abilist64 | tee "$OUT/abilist64.txt"
adb shell getprop ro.dalvik.vm.native.bridge | tee "$OUT/native-bridge.txt"
adb shell getprop ro.enable.native.bridge.exec | tee "$OUT/native-bridge-enabled.txt"

echo "=== INSTALL PATCHED SAKURA ==="
adb install-multiple -r   sakura-lan-mod/x86-fast/patched/signed/jp.garud.ssimulator.apk   sakura-lan-mod/x86-fast/patched/signed/config.arm64_v8a.apk   sakura-lan-mod/x86-fast/patched/signed/UnityDataAssetPack.apk

adb shell pm list packages | grep jp.garud.ssimulator | tee "$OUT/package.txt"
adb logcat -c

echo "=== START HOST USER 0 ==="
adb shell am start -W --user 0   -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity   --es sakuralan_mode host | tee "$OUT/host-start.txt"

sleep 8
adb exec-out screencap -p > "$OUT/host.png" || true
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

sleep 15
adb exec-out screencap -p > "$OUT/client.png" || true
adb logcat -d -v threadtime > "$OUT/logcat.txt" || true
grep 'SakuraLAN' "$OUT/logcat.txt" | tee "$OUT/sakuralan.txt" || true
adb shell ps -A | grep jp.garud.ssimulator | tee "$OUT/processes-client.txt" || true

echo "=== SWITCH BACK TO HOST ==="
adb shell am switch-user 0
sleep 3
adb exec-out screencap -p > "$OUT/host-after-client.png" || true

echo "=== ASSERT LAN HANDSHAKE ==="
grep -q 'NET HOST OK' "$OUT/sakuralan.txt"
grep -q 'NET DIRECT JOIN OK' "$OUT/sakuralan.txt"
grep -q 'Client joined' "$OUT/sakuralan.txt"

echo "PASS: host/client handshake observed"
