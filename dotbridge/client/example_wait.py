#!/usr/bin/env python3
"""Observação local durante uma espera de IA, com autorização e prazo explícitos.

    python3 client/example_wait.py --game-dir CAMINHO --execute --seconds 15 --ai-delay 5

Sem --execute apenas lê o estado. A espera de IA é simulada: substitua decidir()
por uma chamada ASSÍNCRONA ao seu modelo. O exemplo autoriza somente observar,
não andar, atacar ou criar novos objetivos. Não acelera o modelo. Nenhuma thread
ou processo separado renova heartbeat; se o controlador morrer/travar, a lease
expira no mod. O contexto envia stop na saída ou ao atingir --seconds.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time

from dotbridge import DotBridge, DotBridgeError


async def decidir(snapshot: dict, delay: float) -> dict:
    """Substitua pela sua API assíncrona. Nenhuma decisão é executada sozinha."""
    await asyncio.sleep(delay)
    return {"message": "Espera simulada concluída; próximo objetivo depende de autorização.",
            "observed_tick": snapshot.get("tick")}


def timed_state(bridge: DotBridge) -> tuple[dict, dict]:
    before = time.perf_counter()
    snapshot = bridge.state()
    http_ms = (time.perf_counter() - before) * 1000
    captured = snapshot.get("capture_time_ms", snapshot.get("time_ms"))
    age = max(0, time.time() * 1000 - captured) if isinstance(captured, (int, float)) else None
    return snapshot, {"http_state_ms": round(http_ms, 3), "snapshot_age_ms": age,
                      "tick": snapshot.get("tick"), "sequence": snapshot.get("sequence")}


async def run(args) -> int:
    if not 0.1 <= args.seconds <= 60 or not 0 <= args.ai_delay <= 300:
        raise ValueError("--seconds precisa ser 0.1 a 60; --ai-delay, 0 a 300.")
    bridge = DotBridge(args.url, game_dir=args.game_dir, token_path=args.token_file)
    snapshot, metrics = timed_state(bridge)
    print(json.dumps({"observation": snapshot, "measurement": metrics}, ensure_ascii=False))
    if not args.execute:
        return 0
    waiting = None
    accepted = None
    started = time.monotonic()
    with bridge.session(max_seconds=args.seconds, ttl_ms=1500) as session:
        accepted = bridge.goal({"type": "observe", "max_ticks": min(1200, math.ceil(args.seconds * 20))})
        waiting = asyncio.create_task(decidir(snapshot, args.ai_delay))
        try:
            next_observation = time.monotonic()
            while not waiting.done():
                session.pump()
                if time.monotonic() >= next_observation:
                    snapshot, metrics = timed_state(bridge)
                    print(json.dumps({"measurement": metrics, "authorized_goal": accepted["action_id"]},
                                     ensure_ascii=False), flush=True)
                    # Manual intervention, expiry or goal completion ends authorization.
                    recent = snapshot.get("recent_actions") or []
                    finished = next((item for item in recent
                                     if item.get("id") == accepted["action_id"]
                                     and item.get("status") in ("completed", "cancelled", "failed")), None)
                    if finished:
                        print(json.dumps({"goal_finished": finished}, ensure_ascii=False))
                        break
                    next_observation = time.monotonic() + 0.5
                await asyncio.sleep(0.1)
            if waiting.done():
                print(json.dumps({"decision": await waiting,
                                  "controller_wait_ms": (time.monotonic() - started) * 1000}, ensure_ascii=False))
        finally:
            if not waiting.done():
                waiting.cancel()
            await asyncio.gather(waiting, return_exceptions=True)
    # The terminal record distinguishes completion, cancellation and failure.
    if accepted:
        print(json.dumps({"goal_result": bridge.wait(accepted["action_id"], timeout=3)}, ensure_ascii=False))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--game-dir")
    parser.add_argument("--token-file")
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--seconds", type=float, default=15)
    parser.add_argument("--ai-delay", type=float, default=5)
    args = parser.parse_args(argv)
    try:
        return asyncio.run(run(args))
    except (DotBridgeError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Controlador interrompido; stop solicitado e nenhum heartbeat continuará.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
