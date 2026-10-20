#!/usr/bin/env python3
"""Transfere uma pilha entre dois IDs reais de slots, confirmando cada passo.

    python3 client/example_inventory.py --game-dir CAMINHO
    python3 client/example_inventory.py --game-dir CAMINHO --from-slot 10 --to-slot 15 --execute

Primeiro consulte os slots retornados; os números acima são apenas argumentos de
exemplo. Não há coordenadas de tela, portanto mover/inclinar o Spatial GUI não
altera a identificação. O destino precisa estar vazio e o cursor também. Não
repete cliques quando a confirmação falha. Use sobrevivência em mundo de teste.
Este exemplo não monta receitas automaticamente.
"""
from __future__ import annotations

import argparse
import json
import sys

from dotbridge import DotBridge, DotBridgeError


def slot_by_id(snapshot: dict, identifier: int) -> dict:
    slot = next((value for value in snapshot.get("slots", []) if value.get("slot") == identifier), None)
    if slot is None:
        raise ValueError("O ID de slot não está no snapshot atual; consulte inventory novamente.")
    return slot


def pickup(snapshot: dict, slot: dict) -> dict:
    cursor = snapshot["cursor"]
    action = {"type": "inventory", "operation": "click", "container_id": snapshot["container_id"],
              "state_id": snapshot["state_id"], "slot": slot["slot"], "button": 0,
              "click_type": "pickup", "expected_item": slot["item"], "expected_count": slot["count"],
              "expected_cursor_item": cursor["item"], "expected_cursor_count": cursor["count"]}
    if "components_hash" in slot:
        action["expected_components_hash"] = slot["components_hash"]
    if "components_hash" in cursor:
        action["expected_cursor_components_hash"] = cursor["components_hash"]
    return action


def confirmed(session, accepted):
    result = session.wait(accepted["action_id"], timeout=6)
    if result.get("status") != "completed":
        raise DotBridgeError("Transferência não confirmada; interrompida sem repetir o clique. "
                             + str(result.get("reason", result.get("status"))))
    return result


def transfer(bridge: DotBridge, source_id: int, destination_id: int) -> list[dict]:
    if source_id == destination_id:
        raise ValueError("Origem e destino precisam ser slots diferentes.")
    initial = bridge.inventory()
    opened_here = not initial.get("open")
    results = []
    with bridge.session(max_seconds=20, ttl_ms=1500) as session:
        if opened_here:
            confirmed(session, bridge.inventory_action({"type": "inventory", "operation": "open"}))
        before = bridge.inventory()
        source, destination = slot_by_id(before, source_id), slot_by_id(before, destination_id)
        if source["count"] <= 0 or source["item"] == "minecraft:air":
            raise ValueError("O slot de origem está vazio.")
        if destination["count"] or before["cursor"]["count"]:
            raise ValueError("O destino e o cursor precisam estar vazios; nenhuma transferência foi iniciada.")
        if source.get("role") not in ("inventory", "hotbar") or destination.get("role") not in ("inventory", "hotbar"):
            raise ValueError("Este exemplo transfere apenas entre slots inventory/hotbar, sem resultado de crafting.")
        session.pump()
        results.append(confirmed(session, bridge.inventory_action(pickup(before, source))))
        middle = bridge.inventory()
        if (middle["cursor"]["item"] != source["item"] or middle["cursor"]["count"] != source["count"]
                or slot_by_id(middle, source_id)["count"] != 0):
            raise DotBridgeError("O snapshot não confirmou a retirada. Inspecione o cursor antes de continuar.")
        destination = slot_by_id(middle, destination_id)
        if destination["count"]:
            raise DotBridgeError("O destino mudou; pilha permanece no cursor. Nenhum segundo clique foi enviado.")
        session.pump()
        results.append(confirmed(session, bridge.inventory_action(pickup(middle, destination))))
        after = bridge.inventory()
        destination = slot_by_id(after, destination_id)
        if (after["cursor"]["count"] or destination["item"] != source["item"]
                or destination["count"] != source["count"]):
            raise DotBridgeError("O snapshot não confirmou a chegada da pilha; confira inventory e o cursor.")
        if opened_here:
            results.append(confirmed(session, bridge.inventory_action({"type": "inventory", "operation": "close"})))
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--game-dir")
    parser.add_argument("--token-file")
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    parser.add_argument("--from-slot", type=int)
    parser.add_argument("--to-slot", type=int)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    bridge = DotBridge(args.url, game_dir=args.game_dir, token_path=args.token_file)
    try:
        if args.execute:
            if args.from_slot is None or args.to_slot is None:
                raise ValueError("--execute exige --from-slot e --to-slot com IDs do snapshot atual.")
            result = transfer(bridge, args.from_slot, args.to_slot)
        else:
            result = bridge.inventory()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (DotBridgeError, ValueError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
