#!/usr/bin/env python3
"""Inspect pack/profile version metadata without launching or modifying Minecraft.

Only known manifest files and versions/<id>/<id>.json are read. Launcher account
files, logs, configuration secrets, mods and executable arguments are never read
or printed. ZIP files are inspected in place and are never extracted.
"""

from __future__ import annotations

import argparse
import json
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath

MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
MAX_ZIP_ENTRIES = 100_000
MAX_METADATA_FILES = 256
MANIFESTS = ("manifest.json", "modrinth.index.json", "mmc-pack.json")
MC_VERSION = re.compile(r"\d+\.\d+(?:\.\d+)?")
NEO_VERSION = re.compile(r"\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?")


def exact(value: object, pattern: re.Pattern) -> str | None:
    return value if isinstance(value, str) and pattern.fullmatch(value) else None


def parse_metadata(document: object, source: str, filename: str) -> dict | None:
    if not isinstance(document, dict):
        raise ValueError("a raiz do JSON precisa ser um objeto")
    minecraft: set[str] = set()
    neoforge: set[str] = set()
    loaders: set[str] = set()
    kind = "minecraft-profile"

    # Explicitly supplied metadata may have been renamed after download.
    if document.get("manifestType") == "minecraftModpack":
        filename = "manifest.json"
    elif document.get("game") == "minecraft" and isinstance(document.get("dependencies"), dict):
        filename = "modrinth.index.json"
    elif isinstance(document.get("components"), list) and "formatVersion" in document:
        filename = "mmc-pack.json"

    def mc(value: object) -> None:
        if version := exact(value, MC_VERSION):
            minecraft.add(version)

    def neo(value: object) -> None:
        if version := exact(value, NEO_VERSION):
            neoforge.add(version)
            loaders.add("neoforge")

    if filename == "manifest.json":
        kind = "curseforge-manifest"
        game = document.get("minecraft")
        if not isinstance(game, dict):
            raise ValueError("manifest.json sem objeto minecraft")
        mc(game.get("version"))
        for loader in game.get("modLoaders", []):
            if not isinstance(loader, dict):
                continue
            identifier = loader.get("id", "")
            if isinstance(identifier, str):
                name, _, version = identifier.partition("-")
                if name in ("neoforge", "forge", "fabric", "quilt"):
                    loaders.add(name)
                if name == "neoforge":
                    neo(version)
    elif filename == "modrinth.index.json":
        kind = "modrinth-index"
        dependencies = document.get("dependencies")
        if not isinstance(dependencies, dict):
            raise ValueError("modrinth.index.json sem dependencies")
        mc(dependencies.get("minecraft"))
        neo(dependencies.get("neoforge"))
        for name in ("forge", "fabric-loader", "quilt-loader"):
            if name in dependencies:
                loaders.add(name)
    elif filename == "mmc-pack.json":
        kind = "multimc-components"
        components = document.get("components")
        if not isinstance(components, list):
            raise ValueError("mmc-pack.json sem components")
        for component in components:
            if not isinstance(component, dict):
                continue
            uid = component.get("uid")
            if uid == "net.minecraft":
                mc(component.get("version"))
            elif uid in ("net.neoforged", "net.neoforged.neoforge"):
                neo(component.get("version"))
            elif uid in ("net.minecraftforge", "net.fabricmc.fabric-loader", "org.quiltmc.quilt-loader"):
                loaders.add(str(uid))
    else:
        # Explicit version/profile JSON, or a versions/<id>/<id>.json file.
        # Do not infer a version from the profile's filename or display name.
        mc(document.get("inheritsFrom"))
        mc(document.get("id"))
        arguments = document.get("arguments", {})
        game_args = arguments.get("game", []) if isinstance(arguments, dict) else []
        if isinstance(game_args, list):
            for index, value in enumerate(game_args[:-1]):
                if value == "--fml.mcVersion":
                    mc(game_args[index + 1])
                elif value in ("--fml.neoForgeVersion", "--fml.neoVersion"):
                    neo(game_args[index + 1])
        libraries = document.get("libraries", [])
        if isinstance(libraries, list):
            for library in libraries:
                if not isinstance(library, dict):
                    continue
                coordinate = library.get("name", "")
                if not isinstance(coordinate, str):
                    continue
                parts = coordinate.split(":")
                if len(parts) >= 3 and parts[:2] == ["net.neoforged", "neoforge"]:
                    neo(parts[2])
                elif len(parts) >= 3 and parts[:2] == ["net.minecraft", "client"]:
                    mc(parts[2])
                elif len(parts) >= 3 and parts[:2] == ["net.minecraftforge", "forge"]:
                    loaders.add("forge")
                elif len(parts) >= 3 and parts[:2] == ["net.fabricmc", "fabric-loader"]:
                    loaders.add("fabric")
                elif len(parts) >= 3 and parts[:2] == ["org.quiltmc", "quilt-loader"]:
                    loaders.add("quilt")
    if not (minecraft or neoforge or loaders):
        return None
    return {"source": source, "kind": kind, "minecraft": sorted(minecraft),
            "neoforge": sorted(neoforge), "loaders": sorted(loaders)}


def _profile_member(path: PurePosixPath, profile: str | None) -> bool:
    parts = path.parts
    if len(parts) < 3 or parts[-3] != "versions":
        return False
    identifier = parts[-2]
    return path.name == identifier + ".json" and (profile is None or identifier == profile)


def inspect(target: Path, profile: str | None = None) -> dict:
    target = target.expanduser().absolute()
    sources: list[dict] = []
    problems: list[str] = []
    candidates: list[tuple[str, bytes]] = []

    def add_file(path: Path) -> None:
        if not path.is_file():
            return
        if len(candidates) >= MAX_METADATA_FILES:
            problems.append("Mais de 256 arquivos de metadados; selecione um perfil com --profile.")
            return
        try:
            with path.open("rb") as stream:
                data = stream.read(MAX_JSON_BYTES + 1)
            if len(data) > MAX_JSON_BYTES:
                raise ValueError("JSON excede o limite de 2 MiB")
            candidates.append((str(path), data))
        except (OSError, ValueError) as error:
            problems.append(f"{path}: {error}")

    try:
        if target.is_dir():
            for base in (target, target / ".minecraft", target / "minecraft"):
                if not base.is_dir():
                    continue
                for name in MANIFESTS:
                    add_file(base / name)
                # A directory containing one installed version can be passed directly.
                add_file(base / (base.name + ".json"))
                versions = base if base.name == "versions" else base / "versions"
                if not versions.is_dir():
                    continue
                if profile:
                    add_file(versions / profile / (profile + ".json"))
                else:
                    for number, directory in enumerate(versions.iterdir()):
                        if number >= MAX_METADATA_FILES:
                            problems.append("Muitos perfis; selecione um com --profile.")
                            break
                        if directory.is_dir() and not directory.is_symlink():
                            add_file(directory / (directory.name + ".json"))
        elif target.is_file() and target.suffix.lower() == ".json":
            if target.name in ("launcher_profiles.json", "launcher_accounts.json", "accounts.json"):
                problems.append("Arquivo de contas/launcher não é um manifesto de versão e não será lido.")
            else:
                add_file(target)
        elif target.is_file():
            if target.stat().st_size > MAX_ARCHIVE_BYTES:
                raise ValueError("arquivo excede o limite de 1 GiB")
            with zipfile.ZipFile(target) as archive:
                members = archive.infolist()
                if len(members) > MAX_ZIP_ENTRIES:
                    raise ValueError("ZIP excede 100.000 entradas")
                selected: set[str] = set()
                for member in members:
                    path = PurePosixPath(member.filename)
                    if path.name not in MANIFESTS and not _profile_member(path, profile):
                        continue
                    if len(path.parts) > 8 or path.is_absolute() or ".." in path.parts:
                        problems.append("Caminho inválido de metadados dentro do ZIP.")
                        continue
                    if member.filename in selected:
                        problems.append(f"Entrada duplicada no ZIP: {member.filename}")
                        continue
                    selected.add(member.filename)
                    if len(selected) > MAX_METADATA_FILES:
                        raise ValueError("ZIP contém mais de 256 metadados; selecione um perfil")
                    if stat.S_ISLNK(member.external_attr >> 16):
                        problems.append(f"Metadado é link simbólico no ZIP: {member.filename}")
                        continue
                    if member.file_size > MAX_JSON_BYTES:
                        problems.append(f"JSON excede 2 MiB no ZIP: {member.filename}")
                        continue
                    with archive.open(member) as stream:
                        data = stream.read(MAX_JSON_BYTES + 1)
                    if len(data) > MAX_JSON_BYTES:
                        problems.append(f"JSON excede 2 MiB no ZIP: {member.filename}")
                        continue
                    candidates.append((str(target) + "!" + member.filename, data))
        else:
            problems.append("Caminho não encontrado ou tipo de arquivo não suportado.")
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as error:
        problems.append(str(error))

    seen: set[str] = set()
    for source, data in candidates:
        if source in seen:
            continue
        seen.add(source)
        try:
            filename = PurePosixPath(source.rsplit("!", 1)[-1]).name
            record = parse_metadata(json.loads(data.decode("utf-8-sig")), source, filename)
            if record:
                sources.append(record)
        except (ValueError, TypeError, UnicodeError, RecursionError) as error:
            problems.append(f"{source}: metadados inválidos ({type(error).__name__})")

    minecraft = sorted({value for item in sources for value in item["minecraft"]})
    neoforge = sorted({value for item in sources for value in item["neoforge"]})
    loaders = sorted({value for item in sources for value in item["loaders"]})
    if len(minecraft) > 1 or len(neoforge) > 1 or any(name != "neoforge" for name in loaders):
        problems.append("Metadados ambíguos ou de outro loader; não foi confirmada uma combinação única.")
    confirmed = not problems and len(minecraft) == len(neoforge) == 1
    return {"confirmed": confirmed, "minecraft": minecraft[0] if confirmed else None,
            "neoforge": neoforge[0] if confirmed else None, "sources": sources,
            "problems": problems,
            "note": ("Versões confirmadas nos metadados locais; isso não verifica mods nem compatibilidade em jogo."
                     if confirmed else "Versão atual não confirmada. Passe o ZIP do pack ou o JSON exato do perfil usado.")}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="Pasta do jogo/pack, ZIP/MRPACK ou JSON exato da versão")
    parser.add_argument("--profile", help="ID exato em versions/ para evitar outros perfis instalados")
    options = parser.parse_args(argv)
    if options.profile and (options.profile in (".", "..") or "/" in options.profile or "\\" in options.profile):
        parser.error("--profile deve ser um ID, sem separadores de pasta")
    result = inspect(options.path, options.profile)
    # JSON escaping also prevents metadata/path strings from becoming terminal controls.
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0 if result["confirmed"] else 2


if __name__ == "__main__":
    sys.exit(main())
