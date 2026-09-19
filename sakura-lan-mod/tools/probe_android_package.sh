#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:?unpacked root required}"
OUT="${2:?report path required}"

{
  echo "SAKURA ANDROID PACKAGE PROBE"
  echo "============================"
  echo
  echo "APK FILES"
  find "$ROOT" -type f -name '*.apk' -printf '%p\n' | sort
  echo
  echo "NATIVE ARCHITECTURES"
  find "$ROOT" -type f -path '*/lib/*/*.so' -printf '%p\n' | sed -E 's#^.*/lib/([^/]+)/.*#\1#' | sort -u
  echo
  echo "IL2CPP EXPORTED API"
  IL2CPP="$(find "$ROOT" -type f -name libil2cpp.so | head -n1 || true)"
  if [ -n "$IL2CPP" ]; then
    echo "libil2cpp=$IL2CPP"
    nm -D --defined-only "$IL2CPP" 2>/dev/null | grep -E ' il2cpp_(domain_get|domain_get_assemblies|assembly_get_image|class_from_name|class_get_(methods|fields|name|namespace)|method_get_name|field_get_name|field_get_offset|runtime_invoke|string_new|thread_attach|object_get_class|class_get_method_from_name)' | head -n 200 || true
  fi
  echo
  echo "LIBMAIN DEPENDENCIES"
  MAIN="$(find "$ROOT" -type f -name libmain.so | head -n1 || true)"
  if [ -n "$MAIN" ]; then
    echo "libmain=$MAIN"
    readelf -d "$MAIN" 2>/dev/null | grep NEEDED || true
  fi
  echo
  echo "BASE MANIFEST / ACTIVITY"
  BASE="$(find "$ROOT" -type f -name '*.apk' | grep -vE 'config_|AssetPack' | head -n1 || true)"
  echo "base=$BASE"
  if [ -n "$BASE" ]; then
    if command -v aapt2 >/dev/null; then
      aapt2 dump badging "$BASE" | grep -E "^(package:|launchable-activity:|sdkVersion:|targetSdkVersion:|native-code:)" || true
    elif command -v aapt >/dev/null; then
      aapt dump badging "$BASE" | grep -E "^(package:|launchable-activity:|sdkVersion:|targetSdkVersion:|native-code:)" || true
    fi
  fi
} > "$OUT"

cat "$OUT"
