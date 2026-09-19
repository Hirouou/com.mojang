#!/usr/bin/env bash
set -euo pipefail

OUT="sakura-lan-mod/legacy-fast/evidence"
APKDIR="sakura-lan-mod/legacy-fast/patched/signed"
mkdir -p "$OUT"

unlock_user() {
  adb shell wm dismiss-keyguard || true
  adb shell input keyevent 82 || true
  sleep 2
}

tap_new_game() {
  # Pixel 3a AVD reports its native input surface around 2220x1080 in
  # landscape while screencap is scaled down. NEW GAME is near center.
  adb shell wm size || true
  adb shell input tap 1110 500 || true
  sleep 1
  # Fallback for scaled/overridden surfaces used by some emulator revisions.
  adb shell input tap 900 405 || true
}

accept_rewarded_ad_prompt() {
  # The NEW GAME tap opens Sakura's "Start the game after playing video ads"
  # dialog. OK is centered near x=1110,y=520 on the native landscape surface.
  sleep 2
  adb shell input tap 1110 520 || true
}

close_rewarded_ad() {
  # Rewarded ads differ per run. After the reward timer, close the top-right X.
  # If the ad SDK ignores it, Android Back is the fallback.
  sleep 18
  adb shell input tap 2055 90 || true
  sleep 4
  adb shell input keyevent 4 || true
  sleep 6
}

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
unlock_user
sleep 3
adb exec-out screencap -p > "$OUT/lan-menu.png" || true
adb shell am force-stop --user 0 jp.garud.ssimulator

echo "=== START HOST USER 0 ==="
adb shell am start -W --user 0   -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity   --es sakuralan_mode host | tee "$OUT/host-start.txt"
unlock_user
sleep 24
adb exec-out screencap -p > "$OUT/host-main-menu.png" || true
tap_new_game
accept_rewarded_ad_prompt
close_rewarded_ad
adb exec-out screencap -p > "$OUT/host-after-ad.png" || true
sleep 25
adb exec-out screencap -p > "$OUT/host-game-screen.png" || true
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
unlock_user

echo "=== START CLIENT USER $CLIENT_USER ==="
adb shell am start -W --user "$CLIENT_USER"   -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity   --es sakuralan_mode join   --es sakuralan_host 127.0.0.1   --ei sakuralan_port 38556 | tee "$OUT/client-start.txt"
unlock_user
sleep 24
adb exec-out screencap -p > "$OUT/client-main-menu.png" || true
tap_new_game
accept_rewarded_ad_prompt
close_rewarded_ad
adb exec-out screencap -p > "$OUT/client-after-ad.png" || true
sleep 25
adb exec-out screencap -p > "$OUT/client-game-screen.png" || true

adb logcat -d -v threadtime > "$OUT/logcat.txt" || true
grep 'SakuraLAN' "$OUT/logcat.txt" | tee "$OUT/sakuralan.txt" || true
grep -Ei 'FATAL EXCEPTION|SIGABRT|SIGSEGV|UnsatisfiedLinkError|pairip|pgl|integrity'   "$OUT/logcat.txt" | tee "$OUT/fatal.txt" || true
adb shell ps -A | grep jp.garud.ssimulator | tee "$OUT/processes-client.txt" || true

echo "=== SWITCH BACK TO HOST ==="
adb shell am switch-user 0
sleep 4
unlock_user
sleep 12
adb exec-out screencap -p > "$OUT/host-after-client.png" || true

grep -E 'MINBRIDGE (READY|UPDATE|LOCAL|REMOTE CREATED|REMOTE APPLY|CLIENT OFFSET)'   "$OUT/sakuralan.txt" > "$OUT/minbridge.txt" || true

echo "=== ASSERT LAN HANDSHAKE ==="
grep -q 'NET HOST OK' "$OUT/sakuralan.txt"
grep -q 'NET DIRECT JOIN OK' "$OUT/sakuralan.txt"
grep -q 'Client joined' "$OUT/sakuralan.txt"

echo "PASS: legacy Sakura host/client handshake observed"
