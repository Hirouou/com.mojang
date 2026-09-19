#!/usr/bin/env bash
set -euo pipefail

XAPK_DIR="${1:?xapk dir}"
PROBE_SO="${2:?libsakuralan.so}"
OUT_DIR="${3:?output dir}"

mkdir -p "$OUT_DIR/work" "$OUT_DIR/signed"
WORK="$OUT_DIR/work"
SIGNED="$OUT_DIR/signed"

BASE="$XAPK_DIR/jp.garud.ssimulator.apk"
CONFIG="$XAPK_DIR/config.arm64_v8a.apk"
PACK="$XAPK_DIR/UnityDataAssetPack.apk"

for f in "$BASE" "$CONFIG" "$PACK" "$PROBE_SO"; do
  test -f "$f" || { echo "missing: $f" >&2; exit 2; }
done

rm -rf "$WORK/config"
mkdir -p "$WORK/config"
unzip -q "$CONFIG" -d "$WORK/config"
MAIN="$WORK/config/lib/arm64-v8a/libmain.so"
test -f "$MAIN"

if ! patchelf --print-needed "$MAIN" | grep -qx 'libsakuralan.so'; then
  patchelf --add-needed libsakuralan.so "$MAIN"
fi
cp "$PROBE_SO" "$WORK/config/lib/arm64-v8a/libsakuralan.so"

(
  cd "$WORK/config"
  rm -f "$WORK/config-patched-raw.apk"
  zip -0 -q -r "$WORK/config-patched-raw.apk" .
)

BUILD_TOOLS="$(ls -1d "$ANDROID_HOME"/build-tools/* | sort -V | tail -n1)"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"

rm -f "$WORK/sakura-test.keystore"
keytool -genkeypair -noprompt \
  -keystore "$WORK/sakura-test.keystore" \
  -storepass sakuralan -keypass sakuralan \
  -alias sakuralan \
  -keyalg RSA -keysize 2048 -validity 3650 \
  -dname "CN=Sakura LAN Test,OU=Mod Test,O=Local,C=BR" >/dev/null 2>&1

prepare_and_sign() {
  local src="$1"
  local name="$2"
  local tmp="$WORK/${name%.apk}-aligned.apk"
  local out="$SIGNED/$name"
  "$ZIPALIGN" -p -f 4 "$src" "$tmp"
  "$APKSIGNER" sign \
    --ks "$WORK/sakura-test.keystore" \
    --ks-key-alias sakuralan \
    --ks-pass pass:sakuralan \
    --key-pass pass:sakuralan \
    --out "$out" "$tmp"
  "$APKSIGNER" verify --verbose "$out" | head -n 30
}

prepare_and_sign "$BASE" "jp.garud.ssimulator.apk"
prepare_and_sign "$WORK/config-patched-raw.apk" "config.arm64_v8a.apk"
prepare_and_sign "$PACK" "UnityDataAssetPack.apk"

echo "PATCHED CONFIG NEEDED:"
unzip -p "$SIGNED/config.arm64_v8a.apk" lib/arm64-v8a/libmain.so > "$WORK/libmain-signed.so"
readelf -d "$WORK/libmain-signed.so" | grep NEEDED || true

echo "OUTPUT:"
find "$SIGNED" -maxdepth 1 -type f -printf '%f %s\n' | sort
