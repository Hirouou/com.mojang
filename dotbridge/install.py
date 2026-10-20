#!/usr/bin/env python3
"""Prepara o JAR verificado separadamente; instala somente com --game-dir explícito.

Não inicia o jogo, não instala Java e não lê nem cria tokens de autenticação.
Sem argumentos, prepara staging/dotbridge-VERSAO sem alterar um perfil de jogo.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit

PACKAGE_DIR = Path(__file__).resolve().parent
LOCAL_FILENAME = ".dotbridge-local.json"
DEFAULTS = {"port": 8765, "backgroundControl": True}
MIN_NEO = (21, 1, 259)
MAX_NEO = (21, 2, 0)


class InstallError(RuntimeError):
    """Erro de instalação que pode ser mostrado sem revelar credenciais."""


def _constant_invalid(_value):
    raise ValueError("JSON contém número inválido")


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("JSON contém chave duplicada")
        result[key] = value
    return result


def _read_json(path: Path, label: str) -> dict:
    try:
        with path.open("rb") as stream:
            raw = stream.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("arquivo excede 1 MiB")
        value = json.loads(raw.decode("utf-8-sig"), parse_constant=_constant_invalid,
                           object_pairs_hook=_unique_pairs)
        if not isinstance(value, dict):
            raise ValueError("a raiz precisa ser um objeto")
        return value
    except (OSError, ValueError, UnicodeError, RecursionError):
        # Do not echo file content or parser excerpts: configuration may contain secrets.
        raise InstallError(f"{label} inválido ou sem permissão de leitura; nenhum conteúdo foi exibido.") from None


def _is_loopback_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = urlsplit(value)
        port = parsed.port
        return (parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1")
                and parsed.username is None and parsed.password is None
                and parsed.path in ("", "/") and not parsed.query and not parsed.fragment
                and (port is None or 1 <= port <= 65535))
    except ValueError:
        return False


def read_local_settings(package_dir: Path = PACKAGE_DIR) -> dict | None:
    """Lê somente a seleção local do perfil; nunca lê config/dotbridge.token."""
    path = Path(package_dir) / LOCAL_FILENAME
    if not path.exists() and not path.is_symlink():
        return None
    settings = _read_json(path, LOCAL_FILENAME)
    game_dir = settings.get("game_dir")
    if (set(settings) != {"game_dir", "url"} or not isinstance(game_dir, str)
            or not game_dir or not Path(game_dir).is_absolute()
            or not _is_loopback_url(settings.get("url"))):
        raise InstallError(f"{LOCAL_FILENAME} inválido; use apenas game_dir absoluto e URL HTTP local.")
    return settings


def _config_port(config: dict) -> int:
    port = config.get("port", DEFAULTS["port"])
    try:
        valid = (not isinstance(port, bool) and isinstance(port, (int, float))
                 and math.isfinite(port) and int(port) == port and 1024 <= port <= 65535)
    except (OverflowError, ValueError):
        valid = False
    if not valid:
        raise InstallError("config/dotbridge.json inválido: port precisa ser inteiro de 1024 a 65535.")
    background = config.get("backgroundControl", DEFAULTS["backgroundControl"])
    if not isinstance(background, bool):
        raise InstallError("config/dotbridge.json inválido: backgroundControl precisa ser booleano.")
    return int(port)


def _plausible_game_dir(value: str | os.PathLike[str]) -> Path:
    try:
        directory = Path(value).expanduser().resolve(strict=True)
    except (OSError, RuntimeError):
        raise InstallError("--game-dir precisa apontar para uma pasta de Minecraft que já existe.") from None
    if not directory.is_dir():
        raise InstallError("--game-dir precisa apontar para uma pasta, não para um arquivo.")
    markers = ("mods", "config", "versions", "saves", "resourcepacks")
    manifests = ("manifest.json", "modrinth.index.json", "mmc-pack.json", "options.txt")
    if not (any((directory / name).is_dir() for name in markers)
            or any((directory / name).is_file() for name in manifests)):
        raise InstallError("A pasta não parece ser um diretório de jogo: faltam mods, config, versions ou manifesto.")
    for name in ("mods", "config"):
        child = directory / name
        if (child.exists() or child.is_symlink()) and not child.is_dir():
            raise InstallError(f"A entrada {name} precisa ser uma pasta; nada foi instalado.")
    return directory


def _check_profile(game_dir: Path, package_dir: Path, profile: str | None) -> tuple[dict, list[str]]:
    if profile and (profile in (".", "..") or "/" in profile or "\\" in profile):
        raise InstallError("--profile deve ser um ID de versão, sem separadores de pasta.")
    tool_path = package_dir / "tools" / "check_profile.py"
    if not tool_path.is_file():
        return {}, ["Não foi possível verificar os metadados do perfil: tools/check_profile.py ausente."]
    spec = importlib.util.spec_from_file_location("_dotbridge_check_profile", tool_path)
    if spec is None or spec.loader is None:
        raise InstallError("Não foi possível carregar tools/check_profile.py.")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    metadata = checker.inspect(game_dir, profile)
    sources = metadata.get("sources", [])
    minecraft = {version for source in sources for version in source.get("minecraft", [])}
    neoforge = {version for source in sources for version in source.get("neoforge", [])}
    if any(version != "1.21.1" for version in minecraft):
        raise InstallError("Perfil incompatível: DotBridge requer Minecraft Java 1.21.1.")
    for version in neoforge:
        match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:[-+][A-Za-z0-9._-]+)?", version)
        parsed = tuple(map(int, match.groups())) if match else ()
        if not parsed or not MIN_NEO <= parsed < MAX_NEO:
            raise InstallError("Perfil incompatível: requer NeoForge >= 21.1.259 e < 21.2.")
        if parsed == MIN_NEO and "-" in version:
            raise InstallError("A versão prévia do NeoForge não confirma o mínimo estável 21.1.259.")
    if metadata.get("problems"):
        raise InstallError("Metadados do perfil inválidos, ambíguos ou de outro loader. "
                           "Confira tools/check_profile.py ou escolha o ID com --profile.")
    warnings = []
    if not metadata.get("confirmed"):
        warnings.append("Versão do perfil local não confirmada pelos metadados. "
                        "A instalação usa a pasta escolhida explicitamente; confira Minecraft 1.21.1 "
                        "e NeoForge >= 21.1.259 e < 21.2 no TLauncher.")
    return metadata, warnings


def _write_new(path: Path, content: bytes, mode: int = 0o644) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def _save_local(path: Path, settings: dict) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=".dotbridge-local-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(settings, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def _verified_distribution(package_dir: Path) -> tuple[dict, str, bytes, str]:
    build = _read_json(package_dir / "BUILD_INFO.json", "BUILD_INFO.json")
    version, expected = build.get("version"), build.get("jar_sha256")
    if (not isinstance(version, str) or not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._-]*", version)
            or not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected)):
        raise InstallError("BUILD_INFO.json precisa informar version e jar_sha256 válidos.")
    jar_name = f"dotbridge-{version}.jar"
    jar_path = package_dir / jar_name
    try:
        jar_bytes = jar_path.read_bytes()
    except OSError:
        raise InstallError("JAR distribuído ausente ou sem permissão de leitura.") from None
    actual = hashlib.sha256(jar_bytes).hexdigest()
    if actual != expected:
        raise InstallError("SHA-256 do JAR não confere com BUILD_INFO.json; nada foi instalado.")
    return build, jar_name, jar_bytes, expected


def stage(destination: str | os.PathLike[str] | None = None, *, package_dir: Path = PACKAGE_DIR) -> dict:
    """Prepara uma entrega separada, sem instalar ou substituir o mod de um perfil."""
    package_dir = Path(package_dir).resolve()
    build, jar_name, jar_bytes, expected = _verified_distribution(package_dir)
    folder = (Path(destination).expanduser() if destination is not None
              else package_dir / "staging" / ("dotbridge-" + build["version"])).resolve()
    if folder == package_dir or (folder.exists() and not folder.is_dir()):
        raise InstallError("Escolha uma pasta separada para staging; a distribuição original será preservada.")
    local = read_local_settings(package_dir)
    if local:
        live = Path(local["game_dir"]).resolve()
        if folder == live or live in folder.parents:
            raise InstallError("Staging precisa ficar fora do perfil de jogo salvo; a sessão ativa será preservada.")
    for ancestor in (folder, *folder.parents):
        if ancestor.name.lower() in ("mods", "config", "versions", "saves"):
            raise InstallError("Staging não pode usar uma pasta de mods, config, versions ou saves.")
        if any((ancestor / name).is_dir() for name in ("mods", "config", "versions", "saves")):
            raise InstallError("Staging precisa ficar fora de pastas de jogo existentes.")
    contents = {jar_name: jar_bytes, "BUILD_INFO.json":
                (json.dumps(build, ensure_ascii=False, indent=2) + "\n").encode("utf-8")}
    for name, content in contents.items():
        target = folder / name
        if target.exists() or target.is_symlink():
            try:
                identical = target.is_file() and target.read_bytes() == content
            except OSError:
                identical = False
            if not identical:
                raise InstallError("A pasta de staging já contém arquivos diferentes; use outra pasta.")
    folder.mkdir(parents=True, exist_ok=True)
    for name, content in contents.items():
        if not (folder / name).exists():
            _write_new(folder / name, content)
    return {"ok": True, "staged": True, "staging_dir": str(folder), "jar": jar_name,
            "jar_sha256": expected, "version": build["version"],
            "instructions": ["Nenhum perfil ou JAR de sessão em andamento foi alterado.",
                             "Para atualizar: feche o Minecraft, guarde o JAR antigo fora de mods e só então use --game-dir.",
                             "Para reverter: feche o Minecraft, retire o novo JAR e restaure o JAR guardado.",
                             "Preserve config/dotbridge.json e config/dotbridge.token. Java 21 é necessário."]}


def install(game_dir: str | os.PathLike[str], *, package_dir: Path = PACKAGE_DIR,
            profile: str | None = None) -> dict:
    """Valida tudo antes de copiar; preserva outros mods, configuração e token."""
    package_dir = Path(package_dir).resolve()
    game_dir = _plausible_game_dir(game_dir)
    read_local_settings(package_dir)  # Refuse an invalid existing local selection before writes.
    build, jar_name, jar_bytes, expected = _verified_distribution(package_dir)

    metadata, warnings = _check_profile(game_dir, package_dir, profile)
    config_dir, mods_dir = game_dir / "config", game_dir / "mods"
    config_path, target = config_dir / "dotbridge.json", mods_dir / jar_name
    config_exists = config_path.exists() or config_path.is_symlink()
    config = _read_json(config_path, "config/dotbridge.json") if config_exists else dict(DEFAULTS)
    port = _config_port(config)
    # Catch differently-cased and old DotBridge filenames without touching other mods.
    duplicates = [path for path in mods_dir.iterdir()
                  if path.name.lower().startswith("dotbridge") and path.suffix.lower() == ".jar"
                  and path.name != jar_name] if mods_dir.is_dir() else []
    if duplicates:
        raise InstallError("Já existe outro dotbridge*.jar em mods. Com o jogo fechado, "
                           "mova a cópia antiga para fora de mods antes de instalar; nada foi removido.")
    target_exists = target.exists() or target.is_symlink()
    if target_exists:
        try:
            identical = target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == expected
        except OSError:
            identical = False
        if not identical:
            raise InstallError("Já existe um JAR com o mesmo nome e conteúdo diferente em mods; "
                               "não será sobrescrito.")
    if build.get("aetherfall_manifest_verified"):
        warnings.append("Aetherfall: manifesto de referência verificado na distribuição; "
                        "isso não confirma que o pack completo esteja instalado ou testado nesta pasta.")
    warnings.append("Java 21 é necessário para iniciar esse perfil. Este instalador não instala Java nem abre o jogo.")

    # All profile, hash, duplicate and existing-config checks are finished above.
    mods_dir.mkdir(exist_ok=True)
    config_dir.mkdir(exist_ok=True)
    if not target_exists:
        _write_new(target, jar_bytes)
    if not config_exists:
        _write_new(config_path, (json.dumps(DEFAULTS, indent=2) + "\n").encode())
    url = f"http://127.0.0.1:{port}"
    _save_local(package_dir / LOCAL_FILENAME, {"game_dir": str(game_dir), "url": url})
    return {"ok": True, "game_dir": str(game_dir), "url": url, "jar": jar_name,
            "jar_sha256": expected, "jar_copied": not target_exists,
            "config_created": not config_exists, "profile_confirmed": bool(metadata.get("confirmed")),
            "minecraft": metadata.get("minecraft"), "neoforge": metadata.get("neoforge"),
            "warnings": warnings}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    destination = parser.add_mutually_exclusive_group()
    destination.add_argument("--game-dir", help="Instala em pasta de jogo existente; recusa outro dotbridge*.jar")
    destination.add_argument("--stage-dir", help="Prepara uma pasta separada; padrão: staging/dotbridge-VERSAO")
    parser.add_argument("--profile", help="ID exato em versions/ quando existem vários perfis")
    args = parser.parse_args(argv)
    try:
        if args.profile and not args.game_dir:
            raise InstallError("--profile só pode ser usado junto com --game-dir.")
        result = install(args.game_dir, profile=args.profile) if args.game_dir else stage(args.stage_dir)
    except (InstallError, OSError) as error:
        print("Erro: " + str(error), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
