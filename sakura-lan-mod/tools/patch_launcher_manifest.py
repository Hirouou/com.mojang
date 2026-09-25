#!/usr/bin/env python3
import sys
import xml.etree.ElementTree as ET

manifest_path = sys.argv[1]
launcher_name = sys.argv[2] if len(sys.argv) > 2 else "jp.garud.ssimulator.SakuraLanActivity"

ANDROID = "http://schemas.android.com/apk/res/android"
A = "{" + ANDROID + "}"
ET.register_namespace("android", ANDROID)

tree = ET.parse(manifest_path)
root = tree.getroot()
app = root.find("application")
if app is None:
    raise SystemExit("application element not found")

# Remove MAIN/LAUNCHER from the original launcher activity/alias, but remember
# the original target so the LAN menu can launch the real Unity activity.
original_launcher = None
for tag in ("activity", "activity-alias"):
    for node in list(app.findall(tag)):
        for intent in list(node.findall("intent-filter")):
            has_main = any(
                a.get(A + "name") == "android.intent.action.MAIN"
                for a in intent.findall("action")
            )
            has_launcher = any(
                c.get(A + "name") == "android.intent.category.LAUNCHER"
                for c in intent.findall("category")
            )
            if has_main and has_launcher:
                if original_launcher is None:
                    original_launcher = node.get(A + "targetActivity") or node.get(A + "name")
                node.remove(intent)

if not original_launcher:
    original_launcher = "com.unity3d.player.UnityPlayerActivity"

# Switching Android users updates overlay asset paths. Activity recreation
# destroys Unity and kills its process, dropping the active LAN session.
# Unity's existing onConfigurationChanged callback forwards resource changes.
for node in app.findall("activity"):
    if node.get(A + "name") == original_launcher:
        changes = node.get(A + "configChanges", "")
        if changes.startswith("0x") or changes.isdecimal():
            node.set(A + "configChanges", hex(int(changes, 0) | 0x80000000))
        elif "assetsPaths" not in changes.split("|"):
            node.set(A + "configChanges", "|".join(filter(None, [changes, "assetsPaths"])))

meta_name = "jp.garud.ssimulator.SAKURA_ORIGINAL_ACTIVITY"
for old in list(app.findall("meta-data")):
    if old.get(A + "name") == meta_name:
        app.remove(old)
meta = ET.SubElement(app, "meta-data")
meta.set(A + "name", meta_name)
meta.set(A + "value", original_launcher)

# Reuse or add our Activity.
launcher = None
for node in app.findall("activity"):
    if node.get(A + "name") == launcher_name:
        launcher = node
        break
if launcher is None:
    launcher = ET.SubElement(app, "activity")
    launcher.set(A + "name", launcher_name)

launcher.set(A + "exported", "true")
launcher.set(A + "screenOrientation", "landscape")

intent = ET.SubElement(launcher, "intent-filter")
action = ET.SubElement(intent, "action")
action.set(A + "name", "android.intent.action.MAIN")
category = ET.SubElement(intent, "category")
category.set(A + "name", "android.intent.category.LAUNCHER")

# Normal permissions needed by the LAN layer. Duplicate-safe.
wanted_permissions = [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
]
present = {p.get(A + "name") for p in root.findall("uses-permission")}
for perm in wanted_permissions:
    if perm not in present:
        p = ET.Element("uses-permission")
        p.set(A + "name", perm)
        root.insert(0, p)

tree.write(manifest_path, encoding="utf-8", xml_declaration=True)
print("launcher patched:", launcher_name)
print("original launcher:", original_launcher)
