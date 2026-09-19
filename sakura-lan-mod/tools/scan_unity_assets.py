#!/usr/bin/env python3
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()
out = root.parent / "asset-symbol-hints.txt"
path_out = root.parent / "asset-path-hints.txt"

rx = re.compile(r"(player|chara|character|student|girl|boy|menu|costume|attack|weapon|vehicle|car|bike|npc|human|controller|save|load|anim)", re.I)
path_hits = []
string_hits = []
seen = set()

for p in root.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(root))
    if rx.search(rel):
        path_hits.append(rel)

    rel_lower = rel.lower()
    if not any(k in rel_lower for k in ("assets/bin/data", "unitydataassetpack", "sharedassets", "resources", "level")):
        continue
    try:
        proc = subprocess.run(
            ["strings", "-a", "-n", "4", str(p)],
            text=True,
            errors="ignore",
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=45,
        )
    except Exception:
        continue

    for line in proc.stdout.splitlines():
        s = line.strip()
        if len(s) < 4 or len(s) > 220 or not rx.search(s):
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        string_hits.append(f"{rel}\t{s}")
        if len(string_hits) >= 5000:
            break
    if len(string_hits) >= 5000:
        break

path_out.write_text("\n".join(path_hits[:5000]) + "\n", encoding="utf-8")
out.write_text("\n".join(string_hits) + "\n", encoding="utf-8")
print(f"path hints: {len(path_hits)}")
print(f"string hints: {len(string_hits)}")
print(out)
