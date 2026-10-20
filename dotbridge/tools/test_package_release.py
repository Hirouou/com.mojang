import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from package_release import REQUIRED_ROOT_FILES, package


class PackageReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'project'
        self.root.mkdir()
        for name in REQUIRED_ROOT_FILES:
            self.write(name, b'fixture\n')
        self.write('gradle.properties', b'mod_version=1.0.0\nminecraft_version=1.21.1\nneo_version=21.1.259\n')
        self.write('src/main/java/dev/dotbridge/DotBridge.java', b'class DotBridge {}\n')
        self.write('client/dotbridge.py', b'print("client")\n')
        self.write('tools/check_profile.py', b'print("checker")\n')
        self.write('docs/evidence.json', b'{"historical":true}\n')
        self.write('gradle/wrapper/gradle-wrapper.jar', b'wrapper fixture\n')
        self.jar = self.root / 'build/libs/dotbridge-1.0.0.jar'
        self.jar.parent.mkdir(parents=True)
        self.make_jar(self.jar)
        self.prior_hash = hashlib.sha256(self.jar.read_bytes()).hexdigest()
        self.original_info = {
            'name': 'DotBridge', 'version': '1.0.0', 'minecraft': '1.21.1',
            'neoforge_compile_version': '21.1.259', 'jar_sha256': self.prior_hash,
            'unit_tests_passed': 98, 'in_game_checks_passed': 13,
            'runtime_tested_with': ['Minecraft 1.21.1', 'NeoForge 21.1.259'],
            'full_aetherfall_runtime_tested': False,
        }
        self.write('BUILD_INFO.json', json.dumps(self.original_info).encode())
        self.output = self.root / 'build/release'

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    @staticmethod
    def make_jar(path, version='1.0.0', marker=b'original', neoforge='21.1.259'):
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in {
                'dev/dotbridge/DotBridge.class': marker,
                'META-INF/neoforge.mods.toml': (
                    f'modLoader="javafml"\n[[mods]]\nmodId="dotbridge"\nversion="{version}"\n'
                    f'[[dependencies.dotbridge]]\nmodId="minecraft"\nversionRange="[1.21.1]"\n'
                    f'[[dependencies.dotbridge]]\nmodId="neoforge"\nversionRange="[{neoforge},21.2)"\n'
                ).encode(),
            }.items():
                archive.writestr(zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)), data)

    def build(self, **options):
        return package(self.root, self.jar, self.output, **options)

    def test_whitelist_omits_caches_tokens_settings_and_unrelated_root(self):
        omitted = ('client/__pycache__/dotbridge.pyc', 'tools/cache.class',
                   'docs/dotbridge.token', 'docs/dotbridge.json', 'docs/.env',
                   'src/run/private.json', 'run/secret.json', 'private.json',
                   'dotbridge-old.jar', 'docs/launcher_accounts.json')
        for name in omitted:
            self.write(name, b'NEVER_DISTRIBUTE')
        result = self.build()
        with zipfile.ZipFile(result['zip']) as archive:
            names = {name.removeprefix('DotBridge-1.0.0/') for name in archive.namelist()}
            self.assertIn('install.py', names)
            self.assertIn('dot', names)
            self.assertIn('client/dotbridge.py', names)
            self.assertTrue(set(omitted).isdisjoint(names))
            for name in archive.namelist():
                self.assertNotIn(b'NEVER_DISTRIBUTE', archive.read(name))

    def test_changed_jar_hash_does_not_inherit_runtime_validation(self):
        self.make_jar(self.jar, marker=b'fresh CI build')
        result = self.build(source_commit='a' * 40)
        info = json.loads(result['build_info'].read_text())
        self.assertEqual(info['jar_sha256'], hashlib.sha256(self.jar.read_bytes()).hexdigest())
        self.assertEqual(info['prior_runtime_validation']['jar_sha256'], self.prior_hash)
        self.assertFalse(info['packaged_jar_runtime_tested'])
        self.assertFalse(info['packaged_jar_matches_prior_runtime_tested_jar'])
        self.assertNotIn('in_game_checks_passed', info)
        self.assertEqual(info['source_commit'], 'a' * 40)
        self.assertEqual(json.loads((self.root / 'BUILD_INFO.json').read_text()), self.original_info)

    def test_identical_bytes_keep_exact_prior_runtime_relationship(self):
        result = self.build()
        info = json.loads(result['build_info'].read_text())
        self.assertTrue(info['packaged_jar_runtime_tested'])
        self.assertTrue(info['packaged_jar_matches_prior_runtime_tested_jar'])
        self.assertFalse(info['full_aetherfall_runtime_tested'])
        self.assertEqual(result['jar'].read_bytes(), self.jar.read_bytes())

    def test_checksum_manifests_match_all_packaged_and_external_files(self):
        result = self.build()
        with zipfile.ZipFile(result['zip']) as archive:
            prefix = 'DotBridge-1.0.0/'
            lines = archive.read(prefix + 'SHA256SUMS.txt').decode().splitlines()
            checked = set()
            for line in lines:
                digest, name = line.split('  ', 1)
                self.assertEqual(digest, hashlib.sha256(archive.read(prefix + name)).hexdigest())
                checked.add(prefix + name)
            self.assertEqual(checked | {prefix + 'SHA256SUMS.txt'}, set(archive.namelist()))
        for line in result['checksums'].read_text().splitlines():
            digest, name = line.split('  ', 1)
            self.assertEqual(digest, hashlib.sha256((self.output / name).read_bytes()).hexdigest())

    def test_portable_executable_modes(self):
        result = self.build()
        with zipfile.ZipFile(result['zip']) as archive:
            for name in ('gradlew', 'dot', 'install.py'):
                info = archive.getinfo('DotBridge-1.0.0/' + name)
                self.assertEqual((info.external_attr >> 16) & 0o777, 0o755)
            regular = archive.getinfo('DotBridge-1.0.0/README.md')
            self.assertEqual((regular.external_attr >> 16) & 0o777, 0o644)

    def test_package_is_reproducible_for_same_inputs(self):
        first = self.build()['zip'].read_bytes()
        second = package(self.root, self.jar, self.root / 'other-output')['zip'].read_bytes()
        self.assertEqual(first, second)

    def test_sibling_sources_jar_uploaded_separately(self):
        source = self.jar.with_name('dotbridge-1.0.0-sources.jar')
        with zipfile.ZipFile(source, 'w') as archive:
            archive.writestr('dev/dotbridge/DotBridge.java', 'class DotBridge {}')
        result = self.build()
        self.assertEqual(result['sources_jar'].read_bytes(), source.read_bytes())
        self.assertIn(result['sources_jar'].name, result['checksums'].read_text())

    def test_invalid_jar_or_version_is_rejected(self):
        self.jar.write_bytes(b'not a jar')
        with self.assertRaises(ValueError):
            self.build()
        self.make_jar(self.jar, version='2.0.0')
        with self.assertRaisesRegex(ValueError, 'version'):
            self.build()
        self.assertFalse(self.output.exists())

    def test_missing_installer_fails_before_writing_artifacts(self):
        (self.root / 'install.py').unlink()
        with self.assertRaisesRegex(ValueError, 'install.py'):
            self.build()
        self.assertFalse(self.output.exists())

    def test_different_neoforge_build_cannot_be_mislabeled(self):
        self.make_jar(self.jar, neoforge='21.1.172')
        with self.assertRaisesRegex(ValueError, 'NeoForge dependency'):
            self.build()
        self.assertFalse(self.output.exists())

    def test_wrong_build_target_and_invalid_commit_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'commit'):
            self.build(source_commit='not a commit')
        info = dict(self.original_info, neoforge_compile_version='21.1.172')
        self.write('BUILD_INFO.json', json.dumps(info).encode())
        with self.assertRaisesRegex(ValueError, 'target versions disagree'):
            self.build()

    def test_source_symlink_cannot_escape_whitelist(self):
        private = self.root.parent / 'private.py'
        private.write_text('private value')
        (self.root / 'client/leak.py').symlink_to(private)
        with self.assertRaisesRegex(ValueError, 'Symbolic links'):
            self.build()

    def test_output_inside_source_tree_rejected(self):
        with self.assertRaisesRegex(ValueError, 'outside source directories'):
            package(self.root, self.jar, self.root / 'docs/release')


if __name__ == '__main__':
    unittest.main()
