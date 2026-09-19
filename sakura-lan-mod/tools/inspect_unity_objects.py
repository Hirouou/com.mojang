#!/usr/bin/env python3
import pathlib
import re
import sys

import UnityPy

root = pathlib.Path(sys.argv[1]).resolve()
analysis = root.parent
script_out = analysis / "unity-monoscripts.txt"
object_out = analysis / "unity-gameobject-hints.txt"
errors_out = analysis / "unitypy-errors.txt"

interesting = re.compile(
    r"(player|chara|character|student|girl|boy|menu|ui|button|attack|weapon|vehicle|car|npc|human|controller|camera|save|load|anim|thirdperson)",
    re.I,
)

candidates = []
for p in root.rglob("*"):
    if not p.is_file():
        continue
    rel = str(p.relative_to(root)).lower()
    if p.suffix.lower() in {".unity3d", ".assets", ".bundle"}:
        candidates.append(p)
    elif "/assets/aa/" in rel or "/assets/bin/data/" in rel:
        if p.name not in {"global-metadata.dat"} and p.stat().st_size > 64:
            candidates.append(p)

scripts = set()
objects = set()
errors = []

for p in candidates:
    try:
        env = UnityPy.load(str(p))
    except Exception as exc:
        errors.append(f"LOAD\t{p.relative_to(root)}\t{type(exc).__name__}: {exc}")
        continue

    for obj in env.objects:
        try:
            typ = obj.type.name
            if typ == "MonoScript":
                data = obj.read()
                name = getattr(data, "m_Name", "") or ""
                cls = getattr(data, "m_ClassName", "") or ""
                ns = getattr(data, "m_Namespace", "") or ""
                asm = getattr(data, "m_AssemblyName", "") or ""
                row = f"{p.relative_to(root)}\t{name}\t{ns}\t{cls}\t{asm}"
                scripts.add(row)
            elif typ == "GameObject":
                data = obj.read()
                name = getattr(data, "m_Name", "") or ""
                if name and interesting.search(name):
                    objects.add(f"{p.relative_to(root)}\tGameObject\t{name}")
            elif typ in {"MonoBehaviour", "TextAsset"}:
                try:
                    tree = obj.read_typetree()
                except Exception:
                    continue
                vals = []
                for key in ("m_Name", "name", "text", "m_Text"):
                    value = tree.get(key)
                    if isinstance(value, str) and interesting.search(value) and len(value) <= 240:
                        vals.append(value.replace("\n", "\\n"))
                if vals:
                    objects.add(f"{p.relative_to(root)}\t{typ}\t" + " | ".join(vals))
        except Exception as exc:
            errors.append(f"OBJ\t{p.relative_to(root)}\t{obj.type.name}\t{type(exc).__name__}: {exc}")

script_lines = sorted(scripts)
interesting_scripts = [line for line in script_lines if interesting.search(line)]
script_out.write_text(
    "# Interesting MonoScripts first\n"
    + "\n".join(interesting_scripts)
    + "\n# All MonoScripts\n"
    + "\n".join(script_lines[:20000])
    + "\n",
    encoding="utf-8",
)
object_out.write_text("\n".join(sorted(objects)[:20000]) + "\n", encoding="utf-8")
errors_out.write_text("\n".join(errors[:5000]) + "\n", encoding="utf-8")

print(f"candidate files={len(candidates)}")
print(f"monoscripts={len(script_lines)} interesting={len(interesting_scripts)}")
print(f"object hints={len(objects)}")
print(f"errors={len(errors)}")
