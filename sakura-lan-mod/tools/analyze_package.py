#!/usr/bin/env python3
import hashlib
import os
import pathlib
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(sys.argv[1]).resolve()
WORK = ROOT.parent / "unpacked"
REPORT = ROOT.parent / "package-report.txt"
if WORK.exists():
    shutil.rmtree(WORK)
WORK.mkdir(parents=True)

archives = []
for p in ROOT.rglob("*"):
    if p.is_file() and p.suffix.lower() in {".apk", ".xapk", ".apks", ".zip"}:
        archives.append(p)

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

queue = list(archives)
seen = set()
extracted = []
while queue:
    p = queue.pop(0)
    key = str(p.resolve())
    if key in seen:
        continue
    seen.add(key)
    out = WORK / (p.name.replace(".", "_") + "_" + str(len(extracted)))
    out.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(p) as z:
            z.extractall(out)
        extracted.append((p, out))
        for child in out.rglob("*"):
            if child.is_file() and child.suffix.lower() in {".apk", ".xapk", ".apks", ".zip"}:
                queue.append(child)
    except zipfile.BadZipFile:
        pass

all_files = [p for p in WORK.rglob("*") if p.is_file()]
names = [str(p.relative_to(WORK)) for p in all_files]

il2cpp = [p for p in all_files if p.name == "libil2cpp.so"]
unity = [p for p in all_files if p.name == "libunity.so"]
metadata = [p for p in all_files if p.name == "global-metadata.dat"]
assembly = [p for p in all_files if p.name == "Assembly-CSharp.dll"]
globalmanagers = [p for p in all_files if p.name == "globalgamemanagers"]

backend = "UNKNOWN"
if il2cpp and metadata:
    backend = "IL2CPP"
elif assembly:
    backend = "MONO"

lines = []
lines.append("SAKURA PACKAGE ANALYSIS")
lines.append("=======================")
lines.append(f"input_dir={ROOT}")
for p in archives:
    lines.append(f"archive={p.name} bytes={p.stat().st_size} sha256={sha256(p)}")
lines.append(f"backend={backend}")
lines.append(f"libil2cpp.so={len(il2cpp)}")
lines.append(f"libunity.so={len(unity)}")
lines.append(f"global-metadata.dat={len(metadata)}")
lines.append(f"Assembly-CSharp.dll={len(assembly)}")
lines.append(f"globalgamemanagers={len(globalmanagers)}")
lines.append("")
lines.append("KEY FILES")
for p in il2cpp + unity + metadata + assembly + globalmanagers:
    lines.append(str(p.relative_to(WORK)))

# Best-effort Unity version detection from strings in Unity metadata files.
candidates = globalmanagers + unity
found_versions = set()
for p in candidates:
    try:
        out = subprocess.check_output(["strings", "-a", str(p)], text=True, errors="ignore", timeout=30)
        for token in out.split():
            if token.startswith("2020.") or token.startswith("2021.") or token.startswith("2022.") or token.startswith("2023.") or token.startswith("6000."):
                if len(token) < 40:
                    found_versions.add(token.strip("\x00"))
    except Exception:
        pass
lines.append("")
lines.append("UNITY VERSION CANDIDATES")
lines.extend(sorted(found_versions)[:50] or ["none detected"])

lines.append("")
lines.append("NATIVE LIBRARIES")
for p in sorted([x for x in all_files if x.suffix == ".so"], key=lambda x: str(x)):
    lines.append(str(p.relative_to(WORK)))

REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(REPORT.read_text())
