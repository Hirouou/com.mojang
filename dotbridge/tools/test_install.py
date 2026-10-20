"""Installation and shortcut tests; all game profiles are temporary directories.

    python3 -m unittest discover -s dotbridge/tools -v
"""
from __future__ import annotations

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("dotbridge_installer", ROOT / "install.py")
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class ApiServer:
    def __init__(self):
        self.requests = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                owner.requests.append((self.command, self.path, dict(self.headers), None))
                result = {"ok": True, "connected": True, "last_action": {
                    "id": "camera-test", "status": "completed", "type": "camera",
                }}
                self.respond(result)

            def do_POST(self):
                raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                owner.requests.append((self.command, self.path, dict(self.headers), json.loads(raw)))
                self.respond({"ok": True, "action_id": "camera-test"}, 202)

            def respond(self, value, code=200):
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(value).encode())

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.package = self.base / "package"
        self.package.mkdir()
        (self.package / "tools").mkdir()
        shutil.copy2(ROOT / "tools" / "check_profile.py", self.package / "tools" / "check_profile.py")
        self.jar = b"test-distribution-jar-bytes\x00\x01"
        self.jar_name = "dotbridge-1.0.0.jar"
        (self.package / self.jar_name).write_bytes(self.jar)
        (self.package / "BUILD_INFO.json").write_text(json.dumps({
            "version": "1.0.0", "jar_sha256": hashlib.sha256(self.jar).hexdigest(),
            "aetherfall_manifest_verified": True,
        }))
        self.game = self.base / "game"
        self.game.mkdir()
        (self.game / "mods").mkdir()

    def tearDown(self):
        self.temporary.cleanup()

    def install(self, **kwargs):
        return installer.install(self.game, package_dir=self.package, **kwargs)

    def assert_nothing_installed(self):
        self.assertFalse((self.game / "mods" / self.jar_name).exists())
        self.assertFalse((self.package / installer.LOCAL_FILENAME).exists())

    def manifest(self, mc="1.21.1", neo="21.1.259", loader="neoforge"):
        (self.game / "manifest.json").write_text(json.dumps({
            "manifestType": "minecraftModpack", "minecraft": {
                "version": mc, "modLoaders": [{"id": loader + "-" + neo, "primary": True}],
            },
        }))

    def wrapper_files(self):
        shutil.copy2(ROOT / "install.py", self.package / "install.py")
        shutil.copy2(ROOT / "dot", self.package / "dot")
        (self.package / "client").mkdir(exist_ok=True)
        shutil.copy2(ROOT / "client" / "dotbridge.py", self.package / "client" / "dotbridge.py")

    def wrapper(self, *args):
        return subprocess.run([sys.executable, str(self.package / "dot"), *args],
                              cwd=self.base, capture_output=True, text=True, timeout=10,
                              env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})

    def test_explicit_unknown_profile_copies_only_jar_and_defaults_without_token(self):
        other_mod = self.game / "mods" / "other-mod.jar"
        other_mod.write_bytes(b"keep")
        result = self.install()
        self.assertTrue(result["ok"])
        self.assertTrue(result["jar_copied"])
        self.assertFalse(result["profile_confirmed"])
        self.assertEqual((self.game / "mods" / self.jar_name).read_bytes(), self.jar)
        self.assertEqual(other_mod.read_bytes(), b"keep")
        self.assertEqual(json.loads((self.game / "config" / "dotbridge.json").read_text()), installer.DEFAULTS)
        self.assertFalse((self.game / "config" / "dotbridge.token").exists())
        local_file = self.package / installer.LOCAL_FILENAME
        local = json.loads(local_file.read_text())
        self.assertEqual(local, {"game_dir": str(self.game.resolve()), "url": "http://127.0.0.1:8765"})
        self.assertEqual(stat.S_IMODE(local_file.stat().st_mode), 0o600)
        self.assertTrue(any("não confirmada" in value for value in result["warnings"]))
        self.assertTrue(any("Java 21" in value for value in result["warnings"]))
        self.assertTrue(any("não confirma" in value for value in result["warnings"]))

    def test_idempotent_keeps_jar_mtime_and_existing_config_token_other_mod(self):
        (self.game / "config").mkdir()
        config_path = self.game / "config" / "dotbridge.json"
        config = '{ "port": 9123, "backgroundControl": false, "future_setting": "keep" }\n'
        config_path.write_text(config)
        token_path = self.game / "config" / "dotbridge.token"
        token_path.write_bytes(b"existing-token-not-to-be-replaced\n")
        before = token_path.stat().st_mtime_ns
        first = self.install()
        installed = self.game / "mods" / self.jar_name
        old_mtime = installed.stat().st_mtime_ns
        second = self.install()
        self.assertTrue(first["jar_copied"])
        self.assertFalse(second["jar_copied"])
        self.assertFalse(second["config_created"])
        self.assertEqual(installed.stat().st_mtime_ns, old_mtime)
        self.assertEqual(config_path.read_text(), config)
        self.assertEqual(token_path.read_bytes(), b"existing-token-not-to-be-replaced\n")
        self.assertEqual(token_path.stat().st_mtime_ns, before)
        self.assertEqual(second["url"], "http://127.0.0.1:9123")

    def test_java_compatible_integral_port_is_preserved(self):
        (self.game / "config").mkdir()
        config = '{"port":8765.0,"backgroundControl":true}'
        (self.game / "config" / "dotbridge.json").write_text(config)
        result = self.install()
        self.assertEqual(result["url"], "http://127.0.0.1:8765")
        self.assertEqual((self.game / "config" / "dotbridge.json").read_text(), config)

    def test_invalid_existing_game_config_fails_before_any_install_writes(self):
        (self.game / "config").mkdir()
        path = self.game / "config" / "dotbridge.json"
        for raw in ['{bad-secret-content', 'null', '[]', '{"port":true}', '{"port":1023}',
                    '{"port":65536}', '{"port":8765.5}', '{"backgroundControl":"true"}',
                    '{"port":NaN}', '{"port":8765,"port":9999}']:
            with self.subTest(raw=raw):
                path.write_text(raw)
                with self.assertRaises(installer.InstallError) as error:
                    self.install()
                self.assertNotIn("bad-secret-content", str(error.exception))
                self.assertEqual(path.read_text(), raw)
                self.assert_nothing_installed()

    def test_wrong_source_hash_fails_before_writes(self):
        (self.package / self.jar_name).write_bytes(b"modified")
        with self.assertRaisesRegex(installer.InstallError, "SHA-256"):
            self.install()
        self.assert_nothing_installed()
        self.assertFalse((self.game / "config").exists())

    def test_nonexistent_empty_or_unrelated_directory_is_rejected(self):
        missing = self.base / "never-create-me"
        empty = self.base / "empty"
        empty.mkdir()
        unrelated = self.base / "unrelated"
        unrelated.mkdir()
        (unrelated / "notes.txt").write_text("hi")
        for path in (missing, empty, unrelated):
            with self.subTest(path=path), self.assertRaises(installer.InstallError):
                installer.install(path, package_dir=self.package)
        self.assertFalse(missing.exists())
        self.assertEqual(list(empty.iterdir()), [])
        self.assertEqual([p.name for p in unrelated.iterdir()], ["notes.txt"])

    def test_mods_must_be_a_directory(self):
        (self.game / "mods").rmdir()
        (self.game / "mods").write_text("not-directory")
        (self.game / "config").mkdir()
        with self.assertRaisesRegex(installer.InstallError, "mods"):
            self.install()
        self.assertEqual((self.game / "mods").read_text(), "not-directory")

    def test_old_version_duplicate_is_not_deleted(self):
        old = self.game / "mods" / "dotbridge-0.9.0.jar"
        old.write_bytes(b"old-jar")
        with self.assertRaisesRegex(installer.InstallError, "outro dotbridge"):
            self.install()
        self.assertEqual(old.read_bytes(), b"old-jar")
        self.assert_nothing_installed()

    def test_same_name_different_content_is_never_overwritten(self):
        target = self.game / "mods" / self.jar_name
        target.write_bytes(b"another-build")
        with self.assertRaisesRegex(installer.InstallError, "não será sobrescrito"):
            self.install()
        self.assertEqual(target.read_bytes(), b"another-build")
        self.assertFalse((self.game / "config").exists())
        self.assertFalse((self.package / installer.LOCAL_FILENAME).exists())

    def test_invalid_existing_local_config_refused_before_game_writes(self):
        local = self.package / installer.LOCAL_FILENAME
        for raw in ['{bad', '{"game_dir":"relative","url":"http://127.0.0.1:8765"}',
                    '{"game_dir":"/tmp/game","url":"http://example.org:8765"}',
                    '{"game_dir":"/tmp/game","url":"http://127.0.0.1:8765","token":"secret"}']:
            with self.subTest(raw=raw):
                local.write_text(raw)
                with self.assertRaises(installer.InstallError):
                    self.install()
                self.assertEqual(local.read_text(), raw)
                self.assertFalse((self.game / "mods" / self.jar_name).exists())

    def test_compatible_manifest_is_confirmed(self):
        self.manifest()
        result = self.install()
        self.assertTrue(result["profile_confirmed"])
        self.assertEqual(result["minecraft"], "1.21.1")
        self.assertEqual(result["neoforge"], "21.1.259")

    def test_incompatible_minecraft_and_neoforge_versions_are_rejected(self):
        for mc, neo in [("1.20.1", "21.1.259"), ("1.21", "21.1.259"),
                        ("1.21.1", "21.1.258"), ("1.21.1", "21.2.0"),
                        ("1.21.1", "22.1.1"), ("1.21.1", "21.1.259-beta")]:
            with self.subTest(mc=mc, neo=neo):
                self.manifest(mc, neo)
                with self.assertRaises(installer.InstallError):
                    self.install()
                self.assert_nothing_installed()

    def test_malformed_or_wrong_loader_metadata_refused(self):
        (self.game / "manifest.json").write_text("{broken")
        with self.assertRaisesRegex(installer.InstallError, "Metadados"):
            self.install()
        self.assert_nothing_installed()
        self.manifest(loader="fabric")
        with self.assertRaisesRegex(installer.InstallError, "outro loader"):
            self.install()
        self.assert_nothing_installed()

    def test_profile_selector_excludes_other_installed_versions(self):
        versions = self.game / "versions"
        for identifier, mc in [("neo-target", "1.21.1"), ("vanilla-old", "1.20.1")]:
            folder = versions / identifier
            folder.mkdir(parents=True)
            document = {"id": identifier, "inheritsFrom": mc}
            if identifier == "neo-target":
                document["libraries"] = [{"name": "net.neoforged:neoforge:21.1.259"}]
            (folder / (identifier + ".json")).write_text(json.dumps(document))
        with self.assertRaises(installer.InstallError):
            self.install()
        result = self.install(profile="neo-target")
        self.assertTrue(result["profile_confirmed"])

    def test_wrapper_camera_uses_saved_profile_from_another_working_directory(self):
        self.wrapper_files()
        self.install()
        (self.game / "config" / "dotbridge.token").write_text("test-token-never-print")
        with ApiServer() as server:
            (self.package / installer.LOCAL_FILENAME).write_text(json.dumps({
                "game_dir": str(self.game), "url": server.url,
            }))
            result = self.wrapper("camera", "--mode", "third_person_back", "--wait")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["status"], "completed")
            self.assertEqual(server.requests[0][0:2], ("POST", "/v1/action"))
            self.assertEqual(server.requests[0][3], {"type": "camera", "mode": "third_person_back"})
            self.assertEqual(server.requests[0][2]["Authorization"], "Bearer test-token-never-print")
            self.assertEqual(server.requests[1][1], "/v1/state")
            self.assertNotIn("test-token-never-print", result.stdout + result.stderr)

    def test_wrapper_default_state_and_explicit_global_url_override(self):
        self.wrapper_files()
        self.install()
        (self.game / "config" / "dotbridge.token").write_text("token")
        with ApiServer() as server:
            result = self.wrapper("--url", server.url)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(server.requests[0][1], "/v1/state")

    def test_wrapper_health_works_without_install_or_token(self):
        self.wrapper_files()
        with ApiServer() as server:
            result = self.wrapper("--url", server.url, "health")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(server.requests[0][1], "/health")
            self.assertNotIn("Authorization", server.requests[0][2])

    def test_cli_errors_do_not_include_configuration_contents(self):
        self.wrapper_files()
        (self.game / "config").mkdir()
        (self.game / "config" / "dotbridge.json").write_text('{"secret":"private-value",')
        result = subprocess.run([sys.executable, str(self.package / "install.py"), "--game-dir", str(self.game)],
                                cwd=self.base, capture_output=True, text=True, timeout=10,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(result.returncode, 1)
        self.assertIn("Erro:", result.stderr)
        self.assertNotIn("private-value", result.stdout + result.stderr)
        self.assert_nothing_installed()


if __name__ == "__main__":
    unittest.main()
