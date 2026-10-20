#!/usr/bin/env python3
"""Build a portable, hashed release from an explicitly selected DotBridge JAR.

Uses only the Python standard library. Does not compile, launch Minecraft,
modify the selected JAR, install anything, or publish artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = (
    '.gitignore', 'BUILD_INFO.json', 'COMO_USAR_COM_O_DOT.md', 'LEIA-ME.txt',
    'LICENSE', 'README.md', 'VALIDACAO.md', 'build.gradle', 'gradle.properties',
    'gradlew', 'gradlew.bat', 'settings.gradle', 'install.py', 'dot',
    'API-1.1.md', 'ATUALIZACAO-1.1.md',
)
REQUIRED_ROOT_FILES = (
    'BUILD_INFO.json', 'LICENSE', 'README.md', 'build.gradle', 'gradle.properties',
    'gradlew', 'gradlew.bat', 'settings.gradle', 'install.py', 'dot',
)
SOURCE_DIRECTORIES = ('src', 'client', 'tools', 'gradle', 'docs')
SKIP_PARTS = {'.git', '.gradle', '.pytest_cache', '__pycache__', 'build', 'run', 'dist'}
SKIP_NAMES = {'dotbridge.json', 'dotbridge.token', 'launcher_profiles.json',
              'launcher_accounts.json', 'accounts.json', 'credentials.json',
              'options.txt', '.env'}
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_PAYLOAD_BYTES = 64 * 1024 * 1024
EXECUTABLE_FILES = {'gradlew', 'dot', 'install.py'}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_limited(path: Path) -> bytes:
    if path.is_symlink():
        raise ValueError(f'Symbolic links cannot be packaged: {path.name}')
    with path.open('rb') as stream:
        result = stream.read(MAX_FILE_BYTES + 1)
    if len(result) > MAX_FILE_BYTES:
        raise ValueError(f'Input exceeds the 16 MiB file limit: {path.name}')
    return result


def allowed_source(relative: Path) -> bool:
    parts = relative.parts
    if any(part in SKIP_PARTS or part.startswith('.') for part in parts[1:]):
        return False
    if relative.name in SKIP_NAMES or relative.suffix.lower() in ('.pyc', '.pyo', '.class', '.token', '.log'):
        return False
    directory = parts[0]
    if directory in ('client', 'tools'):
        return relative.suffix == '.py'
    if directory == 'gradle':
        return relative.as_posix() in ('gradle/wrapper/gradle-wrapper.jar',
                                       'gradle/wrapper/gradle-wrapper.properties')
    if directory == 'src':
        return relative.suffix.lower() in ('.java', '.toml', '.json', '.mcmeta', '.properties', '.lang', '.png')
    if directory == 'docs':
        return relative.suffix.lower() in ('.json', '.md', '.txt', '.png')
    return False


def collect_sources(root: Path) -> dict[str, bytes]:
    for name in REQUIRED_ROOT_FILES:
        if not (root / name).is_file():
            raise ValueError(f'Required project file is missing: {name}')
    result = {name: read_limited(root / name) for name in ROOT_FILES if (root / name).is_file()}
    for directory in SOURCE_DIRECTORIES:
        folder = root / directory
        if folder.is_symlink():
            raise ValueError(f'Symbolic source directory cannot be packaged: {directory}')
        if not folder.is_dir():
            continue
        for path in sorted(folder.rglob('*')):
            relative = path.relative_to(root)
            if path.is_file() and allowed_source(relative):
                result[relative.as_posix()] = read_limited(path)
    if sum(map(len, result.values())) > MAX_PAYLOAD_BYTES:
        raise ValueError('Whitelisted sources exceed the 64 MiB package limit')
    return result


def properties(data: bytes) -> dict[str, str]:
    result = {}
    for line in data.decode('utf-8').splitlines():
        if line.strip() and not line.lstrip().startswith(('#', '!')) and '=' in line:
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip()
    return result


def build_info(original: dict, jar_hash: str, source_commit: str | None) -> dict:
    """Keep runtime evidence attached to the bytes actually tested previously."""
    info = dict(original)
    validation_keys = ('unit_tests_passed', 'in_game_checks_passed', 'runtime_tested_with')
    prior = dict(info.get('prior_runtime_validation', {}))
    if not prior:
        prior['jar_sha256'] = info.get('jar_sha256')
        for key in validation_keys:
            if key in info:
                prior[key] = info[key]
        prior['full_aetherfall_runtime_tested'] = bool(info.get('full_aetherfall_runtime_tested', False))
    for key in validation_keys:
        info.pop(key, None)
    matches = prior.get('jar_sha256') == jar_hash
    prior_has_runtime_test = bool(prior.get('runtime_tested_with')) and bool(prior.get('in_game_checks_passed'))
    info['jar_sha256'] = jar_hash
    info['source_commit'] = source_commit
    info['prior_runtime_validation'] = prior
    info['packaged_jar_matches_prior_runtime_tested_jar'] = matches
    info['packaged_jar_runtime_tested'] = matches and prior_has_runtime_test
    info['full_aetherfall_runtime_tested'] = False
    info['validation_documents_scope'] = (
        'Retained runtime documents contain prior validation evidence identified by '
        'prior_runtime_validation.jar_sha256. They apply to the selected JAR only '
        'when its SHA-256 matches. This packager does not execute runtime or unit tests; '
        'current CI test results are recorded in the workflow logs.'
    )
    return info


def validate_jar(path: Path, expected_version: str, minecraft: str, neoforge: str) -> bytes:
    data = read_limited(path)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as jar:
            if 'dev/dotbridge/DotBridge.class' not in jar.namelist():
                raise ValueError('Selected JAR does not contain the DotBridge entrypoint')
            metadata = jar.getinfo('META-INF/neoforge.mods.toml')
            if metadata.file_size > 64 * 1024:
                raise ValueError('Selected JAR metadata is too large')
            text = jar.read(metadata).decode('utf-8')
    except (zipfile.BadZipFile, KeyError, UnicodeError) as error:
        raise ValueError('Selected file is not an installable DotBridge NeoForge JAR') from error
    if not re.search(r'(?m)^\s*modId\s*=\s*"dotbridge"\s*$', text):
        raise ValueError('Selected JAR has a different mod ID')
    versions = re.findall(r'(?m)^\s*version\s*=\s*"([^"\n]+)"\s*$', text)
    if versions != [expected_version]:
        raise ValueError('Selected JAR version does not match gradle.properties')
    dependencies = {}
    for block in re.split(r'(?m)^\s*\[\[dependencies\.dotbridge\]\]\s*$', text)[1:]:
        block = block.split('[[', 1)[0]
        mod = re.search(r'(?m)^\s*modId\s*=\s*"([^"\n]+)"\s*$', block)
        version_range = re.search(r'(?m)^\s*versionRange\s*=\s*"([^"\n]+)"\s*$', block)
        if mod and version_range:
            dependencies[mod.group(1)] = version_range.group(1)
    if dependencies.get('minecraft') != f'[{minecraft}]':
        raise ValueError('Selected JAR Minecraft dependency does not match the project target')
    neo_range = dependencies.get('neoforge', '')
    if not (neo_range.startswith(f'[{neoforge},') or neo_range == f'[{neoforge}]'):
        raise ValueError('Selected JAR NeoForge dependency does not match the project target')
    return data


def checksum_manifest(files: dict[str, bytes]) -> bytes:
    return ''.join(f'{sha256(data)}  {name}\n' for name, data in sorted(files.items())).encode('utf-8')


def write_zip(path: Path, prefix: str, files: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(prefix + '/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if name in EXECUTABLE_FILES else 0o100644) << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def package(root: Path, jar: Path, output: Path, source_commit: str | None = None) -> dict[str, Path]:
    root, jar, output = root.resolve(), jar.absolute(), output.resolve()
    if output == root or any(output.is_relative_to(root / name) for name in SOURCE_DIRECTORIES):
        raise ValueError('Output must be outside source directories, for example build/release')
    if source_commit is not None and not re.fullmatch(r'[0-9a-fA-F]{40}|[0-9a-fA-F]{64}', source_commit):
        raise ValueError('source_commit must be a complete hexadecimal Git commit ID')
    files = collect_sources(root)
    config = properties(files['gradle.properties'])
    values = {key: config.get(key, '') for key in ('mod_version', 'minecraft_version', 'neo_version')}
    if any(not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]*', value) for value in values.values()):
        raise ValueError('Invalid or absent release versions in gradle.properties')
    original = json.loads(files['BUILD_INFO.json'].decode('utf-8'))
    if not isinstance(original, dict):
        raise ValueError('BUILD_INFO.json must contain an object')
    if (original.get('version') != values['mod_version']
            or original.get('minecraft') != values['minecraft_version']
            or original.get('neoforge_compile_version') != values['neo_version']):
        raise ValueError('BUILD_INFO.json and gradle.properties target versions disagree')
    jar_bytes = validate_jar(jar, values['mod_version'], values['minecraft_version'], values['neo_version'])
    jar_name = f"dotbridge-{values['mod_version']}.jar"
    files[jar_name] = jar_bytes
    info = build_info(original, sha256(jar_bytes), source_commit)
    files['BUILD_INFO.json'] = (json.dumps(info, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    files['PACOTE-INFO.txt'] = (
        f"DotBridge {values['mod_version']} / Minecraft {values['minecraft_version']} / "
        f"NeoForge {values['neo_version']}\n"
        f"JAR SHA-256: {sha256(jar_bytes)}\n"
        f"JAR idêntico ao validado anteriormente: {'sim' if info['packaged_jar_matches_prior_runtime_tested_jar'] else 'não'}\n"
        'O empacotador não executa o jogo. Documentos de validação retidos contêm\n'
        'evidências prévias identificadas pelo SHA-256 em BUILD_INFO.json; aplicam-se\n'
        'a este JAR somente quando os hashes coincidem.\n'
        'O modpack Aetherfall completo não foi testado.\n'
        'Resultados dos testes automáticos desta compilação constam no log da CI.\n'
    ).encode('utf-8')
    files['SHA256SUMS.txt'] = checksum_manifest(files)
    output.mkdir(parents=True, exist_ok=True)
    stem = (f"DotBridge-{values['mod_version']}-MC{values['minecraft_version']}-"
            f"NeoForge{values['neo_version']}-Linux")
    archive_path = output / (stem + '.zip')
    write_zip(archive_path, 'DotBridge-' + values['mod_version'], files)
    artifacts = {'zip': archive_path, 'jar': output / jar_name,
                 'build_info': output / 'BUILD_INFO.json'}
    artifacts['jar'].write_bytes(jar_bytes)
    artifacts['build_info'].write_bytes(files['BUILD_INFO.json'])
    source_jar = jar.with_name(jar.stem + '-sources.jar')
    if source_jar.is_file():
        source_data = read_limited(source_jar)
        if not zipfile.is_zipfile(source_jar):
            raise ValueError('Sibling source JAR is not a valid ZIP')
        source_output = output / f"dotbridge-{values['mod_version']}-sources.jar"
        source_output.write_bytes(source_data)
        artifacts['sources_jar'] = source_output
    sums = output / 'SHA256SUMS.txt'
    sums.write_bytes(checksum_manifest({path.name: path.read_bytes() for path in artifacts.values()}))
    artifacts['checksums'] = sums
    return artifacts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jar', required=True, type=Path, help='Installable JAR to include without changing its bytes')
    parser.add_argument('--output', type=Path, default=Path('build/release'), help='Artifact output directory')
    parser.add_argument('--source-commit', default=os.environ.get('GITHUB_SHA'), help='Optional complete Git commit ID')
    options = parser.parse_args(argv)
    try:
        artifacts = package(PROJECT_ROOT, options.jar, options.output, options.source_commit)
    except (OSError, ValueError, TypeError, zipfile.BadZipFile) as error:
        print(f'Cannot package DotBridge: {error}', file=sys.stderr)
        return 1
    for name, path in artifacts.items():
        print(f'{name}: {path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
