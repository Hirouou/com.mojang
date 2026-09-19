#!/usr/bin/env bash
set -euo pipefail

OUT="sakura-lan-mod/legacy-fast/evidence"
APKDIR="sakura-lan-mod/legacy-fast/patched/signed"
HOST=emulator-5554
CLIENT=emulator-5556
REQUIRE_GAMEPLAY="${REQUIRE_GAMEPLAY:-1}"
mkdir -p "$OUT"

capture_all() {
  local status=$?
  trap - EXIT
  for role in host client; do
    local serial="$HOST"
    [ "$role" = host ] || serial="$CLIENT"
    adb -s "$serial" logcat -d -b all -v threadtime > "$OUT/$role-logcat.txt" 2>&1 || true
    adb -s "$serial" exec-out screencap -p > "$OUT/$role-final.png" 2>/dev/null || true
    adb -s "$serial" shell dumpsys activity activities > "$OUT/$role-activities.txt" 2>&1 || true
    adb -s "$serial" shell dumpsys window > "$OUT/$role-window.txt" 2>&1 || true
    adb -s "$serial" pull /data/tombstones "$OUT/$role-tombstones" >/dev/null 2>&1 || true
    grep SakuraLAN "$OUT/$role-logcat.txt" > "$OUT/$role-sakuralan.txt" || true
    tail -n 80 "$OUT/$role-sakuralan.txt" || true
  done
  cat "$OUT/host-logcat.txt" "$OUT/client-logcat.txt" > "$OUT/logcat.txt"
  grep SakuraLAN "$OUT/logcat.txt" > "$OUT/sakuralan.txt" || true
  adb -s "$CLIENT" emu kill >/dev/null 2>&1 || true
  exit "$status"
}
trap capture_all EXIT

# Separate foreground displays are necessary: switching Android users pauses
# Unity on the previous user and cannot prove concurrent transform updates.
AVD_NAME="$(adb -s "$HOST" emu avd name | tr -d '\r' | head -n1)"
"$ANDROID_HOME/emulator/emulator" -avd "$AVD_NAME" -port 5556 -read-only \
  -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim \
  -camera-back none -camera-front none -no-snapshot -memory 2048 -cores 2 \
  > "$OUT/client-emulator.txt" 2>&1 &
for _ in $(seq 1 120); do
  if [ "$(adb -s "$CLIENT" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then break; fi
  sleep 2
done
test "$(adb -s "$CLIENT" shell getprop sys.boot_completed | tr -d '\r')" = 1

for serial in "$HOST" "$CLIENT"; do
  adb -s "$serial" root
  adb -s "$serial" wait-for-device
  adb -s "$serial" shell settings put global window_animation_scale 0
  adb -s "$serial" shell settings put global transition_animation_scale 0
  adb -s "$serial" shell settings put global animator_duration_scale 0
  adb -s "$serial" shell wm dismiss-keyguard
  adb -s "$serial" shell input keyevent 82
  adb -s "$serial" install-multiple -r "$APKDIR/jp.garud.ssimulator.apk" \
    "$APKDIR/config.armeabi_v7a.apk" "$APKDIR/UnityDataAssetPack.apk"
  adb -s "$serial" logcat -c
  adb -s "$serial" logcat -G 32M
  adb -s "$serial" shell getprop ro.dalvik.vm.native.bridge
  adb -s "$serial" shell getprop ro.product.cpu.abilist
 done

# Client reaches the host emulator through the runner's UDP forwarding port.
adb -s "$HOST" emu redir add udp:38556:38556
adb -s "$HOST" shell am start -W \
  -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity \
  --es sakuralan_mode host | tee "$OUT/host-start.txt"
sleep 5
adb -s "$CLIENT" shell am start -W \
  -n jp.garud.ssimulator/jp.garud.ssimulator.SakuraLanActivity \
  --es sakuralan_mode join --es sakuralan_host 10.0.2.2 \
  --ei sakuralan_port 38556 | tee "$OUT/client-start.txt"
sleep 35

# Read the actual landscape screenshot size; wm size is reported in portrait.
tap_fraction() {
  local serial="$1" x="$2" y="$3" size
  size="$(adb -s "$serial" shell wm size | tr -d '\r' | tail -n1 | sed 's/.*: //')"
  local a="${size%x*}" b="${size#*x}" w h
  if (( a > b )); then w="$a"; h="$b"; else w="$b"; h="$a"; fi
  adb -s "$serial" shell input tap "$((w*x/1000))" "$((h*y/1000))"
}
for serial in "$HOST" "$CLIENT"; do
  role=host; [ "$serial" = "$HOST" ] || role=client
  adb -s "$serial" exec-out screencap -p > "$OUT/$role-main-menu.png"
  tap_fraction "$serial" 515 465
  sleep 2
  tap_fraction "$serial" 500 480
 done

# Ads use both top-left skip and top-right close. Touch these only while an
# ad Activity is foreground, and retain screenshots to diagnose UI changes.
for attempt in $(seq 1 45); do
  ready=0
  for serial in "$HOST" "$CLIENT"; do
    role=host; [ "$serial" = "$HOST" ] || role=client
    adb -s "$serial" logcat -d -v brief -s SakuraLAN > "$OUT/$role-progress.txt"
    if grep -q 'ARMHOOK REMOTE APPLY' "$OUT/$role-progress.txt"; then
      ready=$((ready+1)); continue
    fi
    pid="$(adb -s "$serial" shell pidof jp.garud.ssimulator | tr -d '\r')"
    test -n "$pid" || { echo "$role process exited" >&2; exit 1; }
    focus="$(adb -s "$serial" shell dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp' || true)"
    printf '%s\n' "$focus" > "$OUT/$role-focus.txt"
    if echo "$focus" | grep -Eiq 'applovin|adfurikun|AdActivity|UnityAds|reward|video|AppLovin'; then
      tap_fraction "$serial" 95 65
      tap_fraction "$serial" 965 65
    fi
    if (( attempt % 5 == 0 )); then
      adb -s "$serial" exec-out screencap -p > "$OUT/$role-progress-$attempt.png"
    fi
  done
  (( ready != 2 )) || break
  if [ "$REQUIRE_GAMEPLAY" = 0 ]; then break; fi
  sleep 4
 done

for role in host client; do
  serial="$HOST"; [ "$role" = host ] || serial="$CLIENT"
  adb -s "$serial" logcat -d -b all -v threadtime > "$OUT/$role-check.txt"
  if grep -Eq 'Fatal signal|signal 11 \(SIGSEGV\)|FATAL EXCEPTION' "$OUT/$role-check.txt"; then
    echo "FAIL: crash on $role" >&2; exit 1
  fi
 done
grep -q 'NET HOST OK' "$OUT/host-check.txt"
grep -q 'Client joined' "$OUT/host-check.txt"
grep -q 'NET DIRECT JOIN OK' "$OUT/client-check.txt"
if [ "$REQUIRE_GAMEPLAY" = 1 ]; then
  for role in host client; do
    for marker in 'ARMHOOK worker detached' 'ARMHOOK UPDATE' 'ARMHOOK LOCAL' 'ARMHOOK REMOTE CREATED' 'ARMHOOK REMOTE APPLY'; do
      grep -q "$marker" "$OUT/$role-check.txt" || { echo "FAIL: $role missing $marker" >&2; exit 1; }
    done
  done
  sleep 15
  adb -s "$HOST" exec-out screencap -p > "$OUT/host-two-players.png"
  adb -s "$CLIENT" exec-out screencap -p > "$OUT/client-two-players.png"
  echo "PASS: both foreground instances created and updated a remote player"
else
  echo "PASS: network-only handshake (gameplay not tested)"
fi
