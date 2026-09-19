#!/usr/bin/env python3
import pathlib
import re
import sys

import UnityPy

root = pathlib.Path(sys.argv[1]).resolve()
analysis = root.parent
script_out = analysis / "unity-monoscripts.txt"
object_out = analysis / "unity-gameobject-hints.txt"
map_out = analysis / "unity-monobehaviour-map.txt"
errors_out = analysis / "unitypy-errors.txt"

interesting = re.compile(
    r"(player|chara|character|student|girl|boy|menu|ui|button|attack|weapon|vehicle|car|npc|human|controller|camera|save|load|anim|thirdperson|joystick|manager)",
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
mb_map = set()
errors = []

for p in candidates:
    rel = p.relative_to(root)
    try:
        env = UnityPy.load(str(p))
    except Exception as exc:
        errors.append(f"LOAD\t{rel}\t{type(exc).__name__}: {exc}")
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
                scripts.add(f"{rel}\t{name}\t{ns}\t{cls}\t{asm}")

            elif typ == "GameObject":
                data = obj.read()
                name = getattr(data, "m_Name", "") or ""
                if name and interesting.search(name):
                    objects.add(f"{rel}\tGameObject\t{name}")

            elif typ == "MonoBehaviour":
                data = obj.read()
                go_name = ""
                script_name = ""
                script_ns = ""
                script_asm = ""

                try:
                    go = data.m_GameObject.read()
                    go_name = getattr(go, "m_Name", "") or ""
                except Exception:
                    pass

                try:
                    script = data.m_Script.read()
                    script_name = (
                        getattr(script, "m_ClassName", "")
                        or getattr(script, "m_Name", "")
                        or ""
                    )
                    script_ns = getattr(script, "m_Namespace", "") or ""
                    script_asm = getattr(script, "m_AssemblyName", "") or ""
                except Exception:
                    pass

                if interesting.search(go_name) or interesting.search(script_name):
                    mb_map.add(
                        f"{rel}\t{go_name}\t{script_ns}\t{script_name}\t{script_asm}\tpathId={obj.path_id}"
                    )

                try:
                    tree = obj.read_typetree()
                except Exception:
                    tree = {}
                vals = []
                for key in ("m_Name", "name", "text", "m_Text"):
                    value = tree.get(key)
                    if isinstance(value, str) and interesting.search(value) and len(value) <= 240:
                        vals.append(value.replace("\n", "\\n"))
                if vals:
                    objects.add(f"{rel}\tMonoBehaviour\t" + " | ".join(vals))

            elif typ == "TextAsset":
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
                    objects.add(f"{rel}\tTextAsset\t" + " | ".join(vals))

        except Exception as exc:
            errors.append(f"OBJ\t{rel}\t{obj.type.name}\t{type(exc).__name__}: {exc}")

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
map_out.write_text("\n".join(sorted(mb_map)[:30000]) + "\n", encoding="utf-8")
errors_out.write_text("\n".join(errors[:5000]) + "\n", encoding="utf-8")

print(f"candidate files={len(candidates)}")
print(f"monoscripts={len(script_lines)} interesting={len(interesting_scripts)}")
print(f"object hints={len(objects)}")
print(f"monobehaviour mappings={len(mb_map)}")
print(f"errors={len(errors)}")
