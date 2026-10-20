#!/usr/bin/env python3
"""Cliente local do DotBridge para Minecraft Java 1.21.1 / NeoForge.

Somente biblioteca padrão. Exemplos:
    python3 client/dotbridge.py health
    python3 client/dotbridge.py --game-dir ~/.minecraft state
    python3 client/dotbridge.py control --forward 1 --ticks 10 --wait
    python3 client/dotbridge.py camera --mode third_person_back --wait

Um agente com acesso ao terminal Linux pode importar DotBridge ou executar a CLI.
Este programa não conecta o ChatGPT ao computador nem chama um serviço de IA.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import (
    HTTPRedirectHandler,
    ProxyHandler,
    Request,
    build_opener,
)


class DotBridgeError(RuntimeError):
    """Falha de configuração, conexão ou ação; status contém o HTTP se disponível."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class ActionTimeout(DotBridgeError):
    """A ação não teve um resultado observável dentro do prazo."""


class SessionExpired(DotBridgeError):
    """O prazo local do controlador terminou; não haverá mais renovações."""


class _NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _number(value: Any, name: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} deve ser um número.")
    try:
        valid = math.isfinite(value) and minimum <= value <= maximum
    except OverflowError:
        valid = False
    if not valid:
        raise ValueError(f"{name} deve estar entre {minimum:g} e {maximum:g}.")
    return value


def _integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} deve ser inteiro.")
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} deve estar entre {minimum} e {maximum}.")
    return value


class DotBridge:
    """API de controle local. Durações usam ticks do jogo (20 ticks ≈ 1 s).

    O token pode ser fornecido diretamente ou lido de token_path/game_dir.
    O arquivo somente é lido ao fazer uma chamada autenticada; health() funciona
    mesmo antes de iniciar o Minecraft ou gerar o token.
    """

    MAX_RESPONSE = 4 * 1024 * 1024
    CAMERA_MODES = ("cycle", "first_person", "third_person_back", "third_person_front")

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8765",
        *,
        token: str | None = None,
        token_path: str | os.PathLike[str] | None = None,
        game_dir: str | os.PathLike[str] | None = None,
        timeout: float = 3.0,
    ):
        try:
            parsed = urlsplit(base_url)
            host = parsed.hostname
            loopback = host == "localhost" or (
                host is not None and ipaddress.ip_address(host).is_loopback
            )
            parsed.port  # Validate malformed/out-of-range ports.
        except (ValueError, TypeError):
            loopback = False
            parsed = None
        if (
            parsed is None
            or not loopback
            or parsed.scheme != "http"
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("A URL deve ser HTTP local, por exemplo http://127.0.0.1:8765.")
        _number(timeout, "timeout", 0.01, 300)
        self.base_url = base_url.rstrip("/")
        self.timeout = float(timeout)
        if token is not None and (not isinstance(token, str) or not token.strip()):
            raise ValueError("O token não pode ser vazio.")
        self._token = token.strip() if token else None
        directory = Path(game_dir).expanduser() if game_dir else Path.home() / ".minecraft"
        self.token_path = (
            Path(token_path).expanduser() if token_path else directory / "config" / "dotbridge.token"
        )
        self._opener = build_opener(ProxyHandler({}), _NoRedirects())

    def _get_token(self) -> str:
        if self._token is None:
            try:
                self._token = self.token_path.read_text(encoding="utf-8").strip()
            except OSError:
                raise DotBridgeError(
                    f"Não foi possível ler o token em {self.token_path}. "
                    "Abra o Minecraft com o mod ou informe --game-dir/--token-file."
                ) from None
            if not self._token:
                self._token = None
                raise DotBridgeError("O arquivo de token está vazio. Reinicie o Minecraft com o mod.")
        if "\r" in self._token or "\n" in self._token:
            raise DotBridgeError("O token contém uma quebra de linha inválida.")
        return self._token

    def _safe(self, message: Any) -> str:
        text = str(message)
        if self._token:
            text = text.replace(self._token, "[token oculto]")
        return text

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        *,
        auth: bool = True,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        if auth:
            headers["Authorization"] = "Bearer " + self._get_token()
        data = None
        if payload is not None:
            data = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            with self._opener.open(request, timeout=timeout or self.timeout) as response:
                raw = response.read(self.MAX_RESPONSE + 1)
        except HTTPError as error:
            try:
                details = json.loads(error.read(self.MAX_RESPONSE).decode("utf-8"))
                message = details.get("error", f"HTTP {error.code}")
            except (ValueError, UnicodeError, AttributeError):
                message = f"HTTP {error.code}"
            finally:
                error.close()
            guidance = {
                401: " Confira o token e o diretório usado pelo TLauncher.",
                403: " A requisição foi recusada pelo mod.",
                409: " Confira o estado do mundo, os menus e as pré-condições da operação.",
                428: " Renove a autorização com heartbeat antes de enviar um objetivo.",
                429: " A fila está cheia; reduza a frequência de chamadas.",
                503: " O jogo não respondeu no prazo.",
            }.get(error.code, "")
            raise DotBridgeError(self._safe(message) + guidance, error.code) from None
        except (URLError, TimeoutError, OSError, ValueError) as error:
            reason = getattr(error, "reason", error)
            raise DotBridgeError(
                "Não foi possível acessar o DotBridge local: " + self._safe(reason)
                + ". Verifique se o jogo com o mod está aberto."
            ) from None
        if len(raw) > self.MAX_RESPONSE:
            raise DotBridgeError("A resposta do mod excedeu o limite de tamanho.")
        try:
            result = json.loads(raw.decode("utf-8"))
        except (UnicodeError, ValueError):
            raise DotBridgeError("O servidor local retornou uma resposta JSON inválida.") from None
        if not isinstance(result, dict):
            raise DotBridgeError("O servidor local retornou um objeto JSON inválido.")
        if result.get("ok") is False:
            raise DotBridgeError(self._safe(result.get("error", "A operação falhou.")))
        return result

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/health", auth=False)

    def state(self) -> dict[str, Any]:
        return self._request("GET", "/v1/state")

    def observe(self, radius: int = 4) -> dict[str, Any]:
        _integer(radius, "radius", 1, 8)
        return self._request("GET", "/v1/observe?" + urlencode({"radius": radius}))

    def action(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Envia uma ação. Métodos tipados abaixo validam os parâmetros locais."""
        if not isinstance(payload, dict):
            raise ValueError("A ação deve ser um objeto JSON.")
        return self._request("POST", "/v1/action", payload)

    def heartbeat(self, ttl_ms: int = 3000) -> dict[str, Any]:
        """Autoriza um prazo curto, sem iniciar novos movimentos ou objetivos."""
        _integer(ttl_ms, "ttl_ms", 500, 10000)
        return self._request("POST", "/v1/heartbeat", {"ttl_ms": ttl_ms})

    def goal(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Objetivo local limitado; o mod valida alvo, duração e segurança."""
        if not isinstance(payload, dict):
            raise ValueError("O objetivo deve ser um objeto JSON.")
        return self._request("POST", "/v1/goal", payload)

    def events(self, after: int = 0) -> dict[str, Any]:
        """Eventos posteriores ao cursor informado; use o próximo cursor retornado."""
        _integer(after, "after", 0, 2**63 - 1)
        return self._request("GET", "/v1/events?" + urlencode({"after": after}))

    def inventory(self) -> dict[str, Any]:
        """Slots reais do menu, ID do contêiner/estado e item no cursor."""
        return self._request("GET", "/v1/inventory")

    def inventory_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Transferência por IDs e pré-condições do snapshot, sem coordenadas de tela."""
        if not isinstance(payload, dict):
            raise ValueError("A ação de inventário deve ser um objeto JSON.")
        return self._request("POST", "/v1/inventory", payload)

    def session(self, *, max_seconds: float = 30, ttl_ms: int = 3000) -> ControllerSession:
        """Lease finita, renovada apenas quando o controlador chama pump()/wait()."""
        return ControllerSession(self, max_seconds=max_seconds, ttl_ms=ttl_ms)

    def control(
        self,
        *,
        forward: float = 0,
        strafe: float = 0,
        jump: bool = False,
        sneak: bool = False,
        sprint: bool = False,
        attack: bool = False,
        use: bool = False,
        ticks: int = 10,
    ) -> dict[str, Any]:
        """Controle relativo à câmera; strafe positivo vai para a esquerda.

        Um novo controle substitui o anterior. Os eixos aceitam valores de -1 a 1.
        Ataque e uso não podem ser acionados simultaneamente.
        """
        _number(forward, "forward", -1, 1)
        _number(strafe, "strafe", -1, 1)
        _integer(ticks, "ticks", 1, 200)
        flags = {"jump": jump, "sneak": sneak, "sprint": sprint, "attack": attack, "use": use}
        for name, value in flags.items():
            if not isinstance(value, bool):
                raise ValueError(f"{name} deve ser booleano.")
        if attack and use:
            raise ValueError("attack e use não podem ser verdadeiros ao mesmo tempo.")
        return self.action({
            "type": "control", "forward": forward, "strafe": strafe,
            **flags, "ticks": ticks,
        })

    def look(self, yaw: float, pitch: float) -> dict[str, Any]:
        _number(yaw, "yaw", -math.inf, math.inf)
        _number(pitch, "pitch", -90, 90)
        return self.action({"type": "look", "yaw": yaw, "pitch": pitch})

    def camera(self, mode: str = "cycle") -> dict[str, Any]:
        """Troca a perspectiva como F5 ou seleciona uma perspectiva diretamente."""
        if not isinstance(mode, str) or mode not in self.CAMERA_MODES:
            raise ValueError("mode deve ser cycle, first_person, third_person_back ou third_person_front.")
        return self.action({"type": "camera", "mode": mode})

    def hotbar(self, slot: int) -> dict[str, Any]:
        _integer(slot, "slot", 1, 9)
        return self.action({"type": "hotbar", "slot": slot})

    def attack(self, ticks: int = 1) -> dict[str, Any]:
        _integer(ticks, "ticks", 1, 200)
        return self.action({"type": "attack", "ticks": ticks})

    def use(self, ticks: int = 1) -> dict[str, Any]:
        _integer(ticks, "ticks", 1, 200)
        return self.action({"type": "use", "ticks": ticks})

    def stop(self) -> dict[str, Any]:
        return self.action({"type": "stop"})

    def wait(
        self,
        action_id: str,
        *,
        timeout: float = 15.0,
        poll_interval: float = 0.1,
        _pump=None,
    ) -> dict[str, Any]:
        """Aguarda um resultado por ID, sem confundir outra ação com a solicitada.

        Só retorna um registro final explícito. Se o resultado já saiu do
        histórico, termina com ActionTimeout em vez de assumir sucesso.
        timeout é tempo de parede; um mundo pausado pode demorar mais que ticks/20.
        """
        if not isinstance(action_id, str) or not action_id:
            raise ValueError("action_id deve ser uma string não vazia.")
        _number(timeout, "timeout", 0.01, 3600)
        _number(poll_interval, "poll_interval", 0.01, 60)
        deadline = time.monotonic() + timeout
        while True:
            if _pump is not None:
                _pump()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ActionTimeout(
                    f"Sem resultado para a ação {action_id} em {timeout:g} s. "
                    "Ela pode estar pendente, pausada ou fora do histórico; use state/stop."
                )
            state = self._request("GET", "/v1/state", timeout=min(self.timeout, remaining))
            records = [state.get("last_action")]
            recent = state.get("recent_actions", [])
            if isinstance(recent, list):
                records.extend(recent)
            for record in records:
                if isinstance(record, dict) and record.get("id") == action_id:
                    if record.get("status") not in (None, "queued", "active", "running", "accepted", "executing"):
                        return record
            if state.get("connected") is False:
                raise DotBridgeError("O Minecraft saiu do mundo durante a espera pela ação.")
            time.sleep(min(poll_interval, max(0, deadline - time.monotonic())))


class ControllerSession:
    """Autorização finita para um controlador que continua vivo e executando seu loop.

    Não cria threads nem processos. Uma chamada de IA bloqueante não renova a
    lease: use uma tarefa assíncrona e chame pump() enquanto aguarda. Se o
    processo morrer/travar, o mod expira o último heartbeat. O prazo máximo
    também impede renovações locais indefinidas. A saída envia stop.
    """

    def __init__(self, bridge: DotBridge, *, max_seconds: float = 30, ttl_ms: int = 3000):
        _number(max_seconds, "max_seconds", 0.1, 300)
        _integer(ttl_ms, "ttl_ms", 500, 10000)
        self.bridge = bridge
        self.max_seconds = float(max_seconds)
        self.ttl_ms = ttl_ms
        self.deadline = None
        self.next_heartbeat = None
        self.closed = False
        self.stop_error = None

    def __enter__(self):
        if self.closed or self.deadline is not None:
            raise SessionExpired("Uma sessão só pode ser iniciada uma vez.")
        self.deadline = time.monotonic() + self.max_seconds
        self.pump()
        return self

    @property
    def remaining_seconds(self) -> float:
        return max(0, self.deadline - time.monotonic()) if self.deadline is not None else 0

    def pump(self) -> None:
        if self.closed or self.deadline is None:
            raise SessionExpired("A sessão não está ativa.")
        now = time.monotonic()
        if now >= self.deadline:
            self.close(suppress_errors=True)
            raise SessionExpired("O prazo do controlador terminou; stop enviado e heartbeat encerrado.")
        if self.next_heartbeat is None or now >= self.next_heartbeat:
            self.bridge.heartbeat(self.ttl_ms)
            self.next_heartbeat = now + self.ttl_ms / 3000
            # An HTTP timeout can consume the remaining local authorization budget.
            if time.monotonic() >= self.deadline:
                self.close(suppress_errors=True)
                raise SessionExpired("A sessão expirou durante o heartbeat; não envie novos objetivos.")

    def wait(self, action_id: str, *, timeout: float = 15, poll_interval: float = 0.1) -> dict[str, Any]:
        """Aguarda conclusão mantendo a lease, limitada ao prazo desta sessão."""
        return self.bridge.wait(action_id, timeout=timeout, poll_interval=poll_interval, _pump=self.pump)

    def close(self, *, suppress_errors: bool = False) -> None:
        if self.closed:
            return
        self.closed = True
        if self.deadline is not None:
            try:
                self.bridge.stop()
            except DotBridgeError as error:
                self.stop_error = error
                if not suppress_errors:
                    raise

    def __exit__(self, exception_type, exception, traceback):
        self.close(suppress_errors=exception_type is not None)
        return False


def _json_object(raw: str) -> dict[str, Any]:
    def invalid_constant(_value):
        raise ValueError("Número JSON inválido")
    try:
        value = json.loads(raw, parse_constant=invalid_constant)
    except (ValueError, TypeError, RecursionError):
        raise ValueError("Informe um objeto JSON válido, com nomes e strings entre aspas duplas.") from None
    if not isinstance(value, dict):
        raise ValueError("O argumento JSON precisa ser um objeto.")
    return value


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://127.0.0.1:8765", help="URL HTTP local do mod")
    parser.add_argument("--game-dir", help="Diretório do jogo selecionado no TLauncher")
    parser.add_argument("--token-file", help="Arquivo config/dotbridge.token")
    parser.add_argument("--timeout", type=float, default=3, help="Timeout HTTP em segundos (padrão: 3)")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("health", help="Verifica o mod sem ler o token")
    commands.add_parser("state", help="Estado compacto do jogo")
    heartbeat = commands.add_parser("heartbeat", help="Renova o prazo do controlador uma única vez")
    heartbeat.add_argument("--ttl-ms", type=int, default=3000, help="Prazo de 500 a 10000 ms")
    goal = commands.add_parser("goal", help="Objetivo limitado como objeto JSON; exige heartbeat")
    goal.add_argument("json", help='Exemplo: {"type":"observe","max_ticks":100}')
    events = commands.add_parser("events", help="Eventos desde um cursor")
    events.add_argument("--after", type=int, default=0)
    commands.add_parser("inventory", help="Slots reais, contêiner, estado e cursor")
    inventory_action = commands.add_parser("inventory-action", help="Ação de inventário como objeto JSON")
    inventory_action.add_argument("json", help='Exemplo: {"type":"inventory","operation":"open"}')
    observe = commands.add_parser("observe", help="Blocos próximos e estado detalhado")
    observe.add_argument("--radius", type=int, default=4, help="Raio em blocos (1 a 8)")
    control = commands.add_parser("control", help="Movimento e teclas por um número de ticks")
    control.add_argument("--forward", type=float, default=0, help="Frente +1, trás -1")
    control.add_argument("--strafe", type=float, default=0, help="Esquerda +1, direita -1")
    for flag in ("jump", "sneak", "sprint", "attack", "use"):
        control.add_argument("--" + flag, action="store_true")
    control.add_argument("--ticks", type=int, default=10, help="1 a 200; 20 ticks ≈ 1 s")
    look = commands.add_parser("look", help="Direção absoluta da câmera em graus")
    look.add_argument("yaw", type=float)
    look.add_argument("pitch", type=float)
    camera = commands.add_parser("camera", help="Troca a perspectiva como F5")
    camera.add_argument("--mode", choices=DotBridge.CAMERA_MODES, default="cycle",
                        help="Perspectiva desejada; cycle alterna como F5 (padrão)")
    hotbar = commands.add_parser("hotbar", help="Seleciona uma posição de 1 a 9")
    hotbar.add_argument("slot", type=int)
    stop = commands.add_parser("stop", help="Solta todos os controles do Dot")
    action_parsers = [control, look, camera, hotbar, stop, goal, inventory_action]
    for command in ("attack", "use"):
        action = commands.add_parser(command, help="Mantém a ação por ticks")
        action.add_argument("--ticks", type=int, default=1)
        action_parsers.append(action)
    for command in action_parsers:
        command.add_argument("--wait", action="store_true", help="Aguarda resultado no estado do jogo")
        command.add_argument("--wait-timeout", type=float, default=15)
    wait = commands.add_parser("wait", help="Aguarda uma ação pelo ID retornado")
    wait.add_argument("action_id")
    wait.add_argument("--wait-timeout", type=float, default=15)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    bridge = None
    try:
        bridge = DotBridge(
            args.url, token_path=args.token_file, game_dir=args.game_dir, timeout=args.timeout,
        )
        command = args.command or "state"
        if command in ("health", "state", "stop", "inventory"):
            result = getattr(bridge, command)()
        elif command == "observe":
            result = bridge.observe(args.radius)
        elif command == "heartbeat":
            result = bridge.heartbeat(args.ttl_ms)
        elif command == "goal":
            result = bridge.goal(_json_object(args.json))
        elif command == "events":
            result = bridge.events(args.after)
        elif command == "inventory-action":
            result = bridge.inventory_action(_json_object(args.json))
        elif command == "control":
            result = bridge.control(**{name: getattr(args, name) for name in (
                "forward", "strafe", "jump", "sneak", "sprint", "attack", "use", "ticks",
            )})
        elif command == "look":
            result = bridge.look(args.yaw, args.pitch)
        elif command == "camera":
            result = bridge.camera(args.mode)
        elif command == "hotbar":
            result = bridge.hotbar(args.slot)
        elif command in ("attack", "use"):
            result = getattr(bridge, command)(args.ticks)
        elif command == "wait":
            result = bridge.wait(args.action_id, timeout=args.wait_timeout)
        if getattr(args, "wait", False):
            action_id = result.get("action_id")
            if not isinstance(action_id, str):
                raise DotBridgeError("O mod não retornou action_id para aguardar.")
            result = bridge.wait(action_id, timeout=args.wait_timeout)
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except (DotBridgeError, ValueError) as error:
        message = bridge._safe(error) if bridge else str(error)
        print(f"Erro: {message}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Interrompido. O controle em andamento expira no limite de ticks; use stop para encerrar já.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
