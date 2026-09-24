#!/usr/bin/env bash
set -euo pipefail

XAPK_DIR="${1:?xapk dir}"
PROBE_SO="${2:?libsakuralan.so}"
OUT_DIR="${3:?output dir}"
LAUNCHER_DEX="${4:-}"
APKTOOL_JAR="${5:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$OUT_DIR/work" "$OUT_DIR/signed"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
WORK="$OUT_DIR/work"
SIGNED="$OUT_DIR/signed"

BASE="$XAPK_DIR/jp.garud.ssimulator.apk"
CONFIG="$XAPK_DIR/config.armeabi_v7a.apk"
PACK="$XAPK_DIR/UnityDataAssetPack.apk"

for f in "$BASE" "$CONFIG" "$PACK" "$PROBE_SO"; do
  test -f "$f" || { echo "missing: $f" >&2; exit 2; }
done

rm -rf "$WORK/config"
mkdir -p "$WORK/config"
unzip -q "$CONFIG" -d "$WORK/config"
python3 "$SCRIPT_DIR/reserve_arm_relay.py" "$WORK/config/lib/armeabi-v7a/libil2cpp.so"
MAIN="$WORK/config/lib/armeabi-v7a/libmain.so"
test -f "$MAIN"

if ! patchelf --print-needed "$MAIN" | grep -qx 'libsakuralan.so'; then
  patchelf --add-needed libsakuralan.so "$MAIN"
fi
cp "$PROBE_SO" "$WORK/config/lib/armeabi-v7a/libsakuralan.so"

(
  cd "$WORK/config"
  rm -f "$WORK/config-patched-raw.apk"
  zip -0 -q -r "$WORK/config-patched-raw.apk" .
)

BASE_TO_SIGN="$BASE"
if [ -n "$LAUNCHER_DEX" ]; then
  test -f "$LAUNCHER_DEX"
  test -f "$APKTOOL_JAR"

  rm -rf "$WORK/base-dec"
  java -jar "$APKTOOL_JAR" d -f -s "$BASE" -o "$WORK/base-dec"
  python3 "$SCRIPT_DIR/patch_launcher_manifest.py"     "$WORK/base-dec/AndroidManifest.xml"     jp.garud.ssimulator.SakuraLanActivity
  java -jar "$APKTOOL_JAR" b "$WORK/base-dec" -o "$WORK/base-rebuilt.apk"

  cp "$WORK/base-rebuilt.apk" "$WORK/base-with-launcher.apk"
  DEX_INDEX=2
  while unzip -l "$WORK/base-with-launcher.apk" | grep -q "classes${DEX_INDEX}\.dex"; do
    DEX_INDEX=$((DEX_INDEX + 1))
  done
  cp "$LAUNCHER_DEX" "$WORK/classes${DEX_INDEX}.dex"
  (
    cd "$WORK"
    zip -0 -q -u base-with-launcher.apk "classes${DEX_INDEX}.dex"
  )
  zip -q -d "$WORK/base-with-launcher.apk" 'META-INF/*' >/dev/null 2>&1 || true
  BASE_TO_SIGN="$WORK/base-with-launcher.apk"
fi

BUILD_TOOLS="$(ls -1d "$ANDROID_HOME"/build-tools/* | sort -V | tail -n1)"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"

rm -f "$WORK/sakura-test.keystore"
keytool -genkeypair -noprompt   -keystore "$WORK/sakura-test.keystore"   -storepass sakuralan -keypass sakuralan   -alias sakuralan   -keyalg RSA -keysize 2048 -validity 3650   -dname "CN=Sakura LAN Test,OU=Mod Test,O=Local,C=BR" >/dev/null 2>&1

prepare_and_sign() {
  local src="$1"
  local name="$2"
  local tmp="$WORK/${name%.apk}-aligned.apk"
  local out="$SIGNED/$name"
  "$ZIPALIGN" -p -f 4 "$src" "$tmp"
  "$APKSIGNER" sign     --ks "$WORK/sakura-test.keystore"     --ks-key-alias sakuralan     --ks-pass pass:sakuralan     --key-pass pass:sakuralan     --out "$out" "$tmp"
  "$APKSIGNER" verify --verbose "$out" | head -n 20
}

prepare_and_sign "$BASE_TO_SIGN" "jp.garud.ssimulator.apk"
prepare_and_sign "$WORK/config-patched-raw.apk" "config.armeabi_v7a.apk"
prepare_and_sign "$PACK" "UnityDataAssetPack.apk"

echo "PATCHED LEGACY CONFIG NEEDED:"
unzip -p "$SIGNED/config.armeabi_v7a.apk" lib/armeabi-v7a/libmain.so > "$WORK/libmain-signed.so"
readelf -d "$WORK/libmain-signed.so" | grep NEEDED || true

echo "OUTPUT:"
find "$SIGNED" -maxdepth 1 -type f -printf '%f %s\n' | sort
