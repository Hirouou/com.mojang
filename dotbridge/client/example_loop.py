#!/usr/bin/env python3
"""Exemplo explícito de observação → decisão → ação, sem serviço de IA.

Execute em um mundo de teste seguro, com menus fechados:
    python3 client/example_loop.py --game-dir ~/.minecraft --execute

Sem --execute apenas observa. Para um agente real, substitua escolher_acao por
sua própria política. ChatGPT precisa de uma ferramenta de terminal/HTTP no
Linux do jogo; este script sozinho não concede esse acesso.
"""

import argparse
import json
import sys

from dotbridge import DotBridge, DotBridgeError


def escolher_acao(observacao):
    """Demonstração curta: gira a câmera; não tenta sobreviver ou navegar."""
    player = observacao.get("player") or {}
    rotation = player.get("rotation") or {}
    return {"type": "look", "yaw": rotation.get("yaw", 0) + 30, "pitch": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", help="Diretório selecionado no TLauncher")
    parser.add_argument("--token-file")
    parser.add_argument("--execute", action="store_true", help="Permite executar o exemplo de câmera")
    args = parser.parse_args()
    bridge = DotBridge(game_dir=args.game_dir, token_path=args.token_file)
    try:
        # Um único pedido traz o estado e a vizinhança; não captura a tela.
        observation = bridge.observe(radius=2)
        print(json.dumps(observation, ensure_ascii=False, indent=2))
        if args.execute:
            # look é instantâneo; para movimento use control(..., ticks=10).
            accepted = bridge.action(escolher_acao(observation))
            result = bridge.wait(accepted["action_id"], timeout=5)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (DotBridgeError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1
    finally:
        if args.execute:
            try:
                bridge.stop()
            except DotBridgeError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
