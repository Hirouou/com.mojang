import io
import json
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path

from check_profile import MAX_JSON_BYTES, inspect, main


class CheckProfileTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.addCleanup(self.directory.cleanup)

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    @staticmethod
    def curse(version="21.1.259"):
        return {"minecraft": {"version": "1.21.1", "modLoaders": [{"id": "neoforge-" + version}]}}

    @staticmethod
    def official(version="21.1.259"):
        return {"id": "custom-profile", "inheritsFrom": "1.21.1",
                "libraries": [{"name": "net.neoforged:neoforge:" + version}],
                "arguments": {"game": ["--accessToken", "NOT_FOR_OUTPUT", "--fml.neoForgeVersion", version]}}

    def test_curseforge_manifest(self):
        self.write("manifest.json", self.curse())
        result = inspect(self.root)
        self.assertTrue(result["confirmed"])
        self.assertEqual((result["minecraft"], result["neoforge"]), ("1.21.1", "21.1.259"))

    def test_modrinth_zip_is_not_extracted(self):
        archive = self.root / "pack.mrpack"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("modrinth.index.json", json.dumps({"dependencies": {"minecraft": "1.21.1", "neoforge": "21.1.259"}}))
            output.writestr("overrides/config/dotbridge.token", "DO_NOT_READ")
        result = inspect(archive)
        self.assertTrue(result["confirmed"])
        self.assertNotIn("DO_NOT_READ", json.dumps(result))
        self.assertFalse((self.root / "modrinth.index.json").exists())

    def test_explicit_renamed_curseforge_manifest(self):
        document = self.curse()
        document["manifestType"] = "minecraftModpack"
        path = self.write("downloaded-metadata.json", document)
        self.assertTrue(inspect(path)["confirmed"])

    def test_multimc_components(self):
        self.write("mmc-pack.json", {"components": [{"uid": "net.minecraft", "version": "1.21.1"},
                                                      {"uid": "net.neoforged", "version": "21.1.259"}]})
        self.assertTrue(inspect(self.root)["confirmed"])

    def test_official_profile_and_no_argument_disclosure(self):
        path = self.write("versions/custom/custom.json", self.official())
        result = inspect(self.root)
        self.assertTrue(result["confirmed"])
        self.assertEqual(result["sources"][0]["source"], str(path))
        self.assertNotIn("NOT_FOR_OUTPUT", json.dumps(result))

    def test_multiple_versions_ambiguous_until_selected(self):
        self.write("versions/new/new.json", self.official())
        self.write("versions/old/old.json", self.official("21.1.172"))
        self.assertFalse(inspect(self.root)["confirmed"])
        result = inspect(self.root, "new")
        self.assertTrue(result["confirmed"])
        self.assertEqual(result["neoforge"], "21.1.259")

    def test_conflicting_pack_and_profile_not_confirmed(self):
        self.write("manifest.json", self.curse("21.1.172"))
        self.write("versions/custom/custom.json", self.official())
        self.assertFalse(inspect(self.root)["confirmed"])

    def test_internally_conflicting_profile_not_confirmed(self):
        document = self.official()
        document["arguments"]["game"][-1] = "21.1.172"
        path = self.write("custom.json", document)
        self.assertFalse(inspect(path)["confirmed"])

    def test_does_not_infer_from_filename(self):
        path = self.write("neoforge-21.1.259.json", {"id": "neoforge-21.1.259", "inheritsFrom": "1.21.1"})
        self.assertFalse(inspect(path)["confirmed"])

    def test_forge_pack_is_not_neoforge(self):
        self.write("manifest.json", {"minecraft": {"version": "1.21.1", "modLoaders": [{"id": "forge-52.0.0"}]}})
        self.assertFalse(inspect(self.root)["confirmed"])

    def test_known_other_loader_profile_libraries_report_incompatibility(self):
        for coordinate, loader in (("net.minecraftforge:forge:1.21.1-52.0.0", "forge"),
                                   ("net.fabricmc:fabric-loader:0.16.14", "fabric"),
                                   ("org.quiltmc:quilt-loader:0.27.1", "quilt")):
            with self.subTest(loader=loader):
                path = self.write("profile.json", {"id": "custom", "inheritsFrom": "1.21.1",
                                                   "libraries": [{"name": coordinate}]})
                result = inspect(path)
                self.assertFalse(result["confirmed"])
                self.assertTrue(result["problems"])
                self.assertEqual(result["sources"][0]["loaders"], [loader])

    def test_mixed_neoforge_and_other_loader_profile_is_rejected(self):
        for coordinate in ("net.minecraftforge:forge:1.21.1-52.0.0",
                           "net.fabricmc:fabric-loader:0.16.14",
                           "org.quiltmc:quilt-loader:0.27.1"):
            with self.subTest(coordinate=coordinate):
                document = self.official()
                document["libraries"].append({"name": coordinate})
                result = inspect(self.write("profile.json", document))
                self.assertFalse(result["confirmed"])
                self.assertTrue(result["problems"])

    def test_oversized_json_not_read(self):
        self.write("manifest.json", self.curse())
        path = self.root / "mmc-pack.json"
        path.write_bytes(b" " * (MAX_JSON_BYTES + 1))
        result = inspect(self.root)
        self.assertFalse(result["confirmed"])
        self.assertTrue(result["problems"])

    def test_traversal_zip_metadata_is_rejected(self):
        archive = self.root / "pack.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("../manifest.json", json.dumps(self.curse()))
        result = inspect(archive)
        self.assertFalse(result["confirmed"])
        self.assertFalse((self.root.parent / "manifest.json").exists())

    def test_invalid_json_and_absent_path(self):
        path = self.root / "manifest.json"
        path.write_text("{broken", encoding="utf-8")
        self.assertFalse(inspect(self.root)["confirmed"])
        self.assertFalse(inspect(self.root / "absent")["confirmed"])

    def test_never_reads_account_file(self):
        path = self.write("launcher_accounts.json", self.official())
        result = inspect(path)
        self.assertFalse(result["confirmed"])
        self.assertEqual(result["sources"], [])

    def test_cli_exit_and_output(self):
        path = self.write("manifest.json", self.curse())
        output = io.StringIO()
        with redirect_stdout(output):
            status = main([str(path)])
        self.assertEqual(status, 0)
        self.assertTrue(json.loads(output.getvalue())["confirmed"])


if __name__ == "__main__":
    unittest.main()
