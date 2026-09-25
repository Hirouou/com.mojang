#!/usr/bin/env bash
set -euo pipefail

OUT="sakura-lan-mod/legacy-fast/evidence"
APKDIR="sakura-lan-mod/legacy-fast/patched/signed"
PKG="jp.garud.ssimulator"
CLIENT_USER=""
REQUIRE_GAMEPLAY="${REQUIRE_GAMEPLAY:-1}"
mkdir -p "$OUT"

adb_quiet() {
  timeout 20s adb "$@" >/dev/null 2>&1 || true
}

capture_all() {
  local status=$?
  trap - EXIT
  timeout 20s adb exec-out screencap -p > "$OUT/exit-screen.png" || true
  timeout 20s adb shell 'for pid in $(pidof jp.garud.ssimulator); do cat /proc/$pid/maps; done' > "$OUT/process-maps.txt" 2>&1 || true
  timeout 30s adb logcat -d -b all -v threadtime > "$OUT/logcat.txt" 2>&1 || true
  grep SakuraLAN "$OUT/logcat.txt" > "$OUT/sakuralan.txt" || true
  grep -Ei 'Fatal signal|signal 11|SIGSEGV|FATAL EXCEPTION' \
    "$OUT/logcat.txt" > "$OUT/fatal.txt" || true
  timeout 20s adb pull /data/tombstones "$OUT/tombstones" >/dev/null 2>&1 || true
  adb_quiet shell am switch-user 0
  exit "$status"
}
trap capture_all EXIT

tap_fraction() {
  local x="$1" y="$2" size a b w h
  size="$(adb shell wm size | tr -d '\r' | tail -n1 | sed 's/.*: //')"
  a="${size%x*}"
  b="${size#*x}"
  if (( a > b )); then w="$a"; h="$b"; else w="$b"; h="$a"; fi
  # Hold DOWN across a frame even when ARM translation renders below 5 FPS.
  adb shell input touchscreen swipe "$((w*x/1000))" "$((h*y/1000))" \
    "$((w*x/1000))" "$((h*y/1000))" 1000
}

unlock_user() {
  adb_quiet shell wm dismiss-keyguard
  adb_quiet shell input keyevent 82
}

player_pid() {
  timeout 20s adb shell ps -A -o USER,PID,NAME | tr -d '\r' |
    awk -v user="u${1}_a" -v pkg="$PKG" '$1 ~ ("^" user "[0-9]+$") && $3 == pkg {print $2; exit}'
}

enter_map() {
  local role="$1" pid="$2" before current
  # ARM translation may still show the splash screen after 20 seconds.
  sleep 60
  adb exec-out screencap -p > "$OUT/$role-main-menu.png"
  before="$(adb logcat --pid="$pid" -d -v brief -s SakuraLAN | grep -c 'ARMHOOK UPDATE' || true)"
  tap_fraction 687 110
  sleep 3
  tap_fraction 515 465
  sleep 5
  adb exec-out screencap -p > "$OUT/$role-after-new-game.png"
  tap_fraction 500 480

  for attempt in $(seq 1 50); do
    current="$(adb logcat --pid="$pid" -d -v brief -s SakuraLAN | grep -c 'ARMHOOK UPDATE' || true)"
    if (( current > before )); then
      sleep 5
      adb exec-out screencap -p > "$OUT/$role-entered-map.png"
      return 0
    fi
    adb shell kill -0 "$pid" || return 1
    # No blind taps on ad surfaces: they can launch an external browser.
    if (( attempt % 10 == 0 )); then
      adb exec-out screencap -p > "$OUT/$role-ad-$attempt.png"
    fi
    sleep 3
  done
  return 1
}

adb root
adb wait-for-device
adb install-multiple -r \
  "$APKDIR/jp.garud.ssimulator.apk" \
  "$APKDIR/config.armeabi_v7a.apk" \
  "$APKDIR/UnityDataAssetPack.apk"
adb logcat -c
adb logcat -G 32M
# Exercise an offline LAN session. Loopback UDP stays available while ad SDKs
# take the game's ordinary no-internet path, without opening advertiser links.
adb shell svc wifi disable
adb shell svc data disable
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true >/dev/null

adb shell am start -W --user 0 \
  -n "$PKG/jp.garud.ssimulator.SakuraLanActivity" \
  --es sakuralan_mode host --ez sakuralan_ci_pose true \
  | tee "$OUT/host-start.txt"
unlock_user
HOST_PID="$(player_pid 0)"
test -n "$HOST_PID"
printf '%s\n' "$HOST_PID" > "$OUT/host-pid.txt"
if [ "$REQUIRE_GAMEPLAY" = 1 ]; then enter_map host "$HOST_PID"; else sleep 8; fi

CREATE="$(adb shell pm create-user SakuraClient)"
CLIENT_USER="$(sed -n 's/.* id \([0-9][0-9]*\).*/\1/p' <<< "$CREATE")"
test -n "$CLIENT_USER"
printf '%s\n' "$CLIENT_USER" > "$OUT/client-user-id.txt"
adb shell pm install-existing --user "$CLIENT_USER" "$PKG"
adb shell am start-user -w "$CLIENT_USER"
adb shell am switch-user "$CLIENT_USER"
sleep 3
unlock_user
adb shell am start -W --user "$CLIENT_USER" \
  -n "$PKG/jp.garud.ssimulator.SakuraLanActivity" \
  --es sakuralan_mode join --es sakuralan_host 127.0.0.1 \
  --ei sakuralan_port 38556 --ez sakuralan_ci_pose true \
  | tee "$OUT/client-start.txt"
CLIENT_PID="$(player_pid "$CLIENT_USER")"
test -n "$CLIENT_PID"
printf '%s\n' "$CLIENT_PID" > "$OUT/client-pid.txt"
if [ "$REQUIRE_GAMEPLAY" = 1 ]; then enter_map client "$CLIENT_PID"; else sleep 8; fi

if [ "$REQUIRE_GAMEPLAY" = 0 ]; then
  adb logcat -d -b all -v threadtime > "$OUT/check.txt"
  grep -q 'NET HOST OK' "$OUT/check.txt"
  grep -q 'Client joined' "$OUT/check.txt"
  grep -q 'NET DIRECT JOIN OK' "$OUT/check.txt"
  echo "PASS: network-only handshake"
  exit 0
fi

adb shell am switch-user 0
sleep 3
unlock_user
sleep 15
adb exec-out screencap -p > "$OUT/host-two-players.png"

adb shell am switch-user "$CLIENT_USER"
sleep 3
unlock_user
sleep 15
adb exec-out screencap -p > "$OUT/client-two-players.png"

adb logcat -d -b all -v threadtime > "$OUT/check.txt"
grep -q 'NET HOST OK' "$OUT/check.txt"
grep -q 'Client joined' "$OUT/check.txt"
grep -q 'NET DIRECT JOIN OK' "$OUT/check.txt"
for role in host client; do
  pid="$(cat "$OUT/$role-pid.txt")"
  adb shell kill -0 "$pid"
  awk -v pid="$pid" '$3 == pid' "$OUT/check.txt" > "$OUT/$role-runtime.txt"
  for marker in 'ARMHOOK READY' 'ARMHOOK worker detached' 'ARMHOOK REMOTE CREATED' 'ARMHOOK REMOTE APPLY' 'ARMHOOK CI FACE'; do
    grep -q "$marker" "$OUT/$role-runtime.txt" || { echo "FAIL: $role missing $marker" >&2; exit 1; }
  done
done
if grep -Eq 'Fatal signal|signal 11 \(SIGSEGV\)|FATAL EXCEPTION' "$OUT/check.txt"; then
  echo "FAIL: Android crash detected" >&2
  exit 1
fi

echo "PASS: two players captured in one LAN session"
