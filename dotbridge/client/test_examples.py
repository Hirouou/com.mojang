"""Safety checks for the finite wait loop and confirmed inventory example."""
import argparse
import asyncio
import contextlib
import io
import unittest
from unittest import mock

from dotbridge import ControllerSession, DotBridgeError, SessionExpired
import example_inventory
import example_wait


def inventory_state(state_id=1, source_count=4, target_count=0, cursor_count=0):
    return {"available": True, "open": True, "container_id": 0, "state_id": state_id,
            "cursor": {"item": "minecraft:stone" if cursor_count else "minecraft:air", "count": cursor_count},
            "slots": [{"slot": 10, "role": "inventory", "item": "minecraft:stone" if source_count else "minecraft:air",
                       "count": source_count, "components_hash": "a1"},
                      {"slot": 15, "role": "inventory", "item": "minecraft:stone" if target_count else "minecraft:air",
                       "count": target_count, "components_hash": "b2"}]}


class ExampleTests(unittest.TestCase):
    def bridge_for_transfer(self, states, results=None):
        bridge = mock.Mock()
        bridge.inventory.side_effect = states
        bridge.inventory_action.side_effect = [{"action_id": "first"}, {"action_id": "second"}]
        session = mock.Mock()
        session.wait.side_effect = results or [{"id": "first", "status": "completed"},
                                               {"id": "second", "status": "completed"}]
        context = mock.MagicMock()
        context.__enter__.return_value = session
        bridge.session.return_value = context
        return bridge, session

    def test_transfer_uses_fresh_state_and_actual_slots_after_confirmation(self):
        before = inventory_state()
        middle = inventory_state(2, source_count=0, cursor_count=4)
        after = inventory_state(3, source_count=0, target_count=4)
        bridge, session = self.bridge_for_transfer([before, before, middle, after])
        result = example_inventory.transfer(bridge, 10, 15)
        self.assertEqual(len(result), 2)
        actions = [call.args[0] for call in bridge.inventory_action.call_args_list]
        self.assertEqual(actions[0]["slot"], 10)
        self.assertEqual(actions[0]["state_id"], 1)
        self.assertEqual(actions[0]["expected_item"], "minecraft:stone")
        self.assertEqual(actions[0]["expected_cursor_item"], "minecraft:air")
        self.assertEqual(actions[1]["slot"], 15)
        self.assertEqual(actions[1]["state_id"], 2)
        self.assertEqual(actions[1]["expected_item"], "minecraft:air")
        self.assertEqual(actions[1]["expected_cursor_item"], "minecraft:stone")
        self.assertEqual(actions[1]["expected_cursor_count"], 4)
        self.assertFalse(any("x" in action or "y" in action for action in actions))
        self.assertEqual(session.wait.call_count, 2)

    def test_transfer_never_retries_after_unconfirmed_first_click(self):
        before = inventory_state()
        bridge, session = self.bridge_for_transfer([before, before], [{"id": "first", "status": "failed",
                                                                     "reason": "server_confirmation_timeout"}])
        with self.assertRaisesRegex(DotBridgeError, "sem repetir"):
            example_inventory.transfer(bridge, 10, 15)
        self.assertEqual(bridge.inventory_action.call_count, 1)
        self.assertEqual(session.wait.call_count, 1)

    def test_transfer_stops_if_destination_changed_while_cursor_holds_stack(self):
        before = inventory_state()
        middle = inventory_state(2, source_count=0, target_count=2, cursor_count=4)
        bridge, _session = self.bridge_for_transfer([before, before, middle])
        with self.assertRaisesRegex(DotBridgeError, "destino mudou"):
            example_inventory.transfer(bridge, 10, 15)
        self.assertEqual(bridge.inventory_action.call_count, 1)

    def test_transfer_refuses_nonempty_cursor_or_crafting_result(self):
        for before in (inventory_state(cursor_count=1), inventory_state()):
            if not before["cursor"]["count"]:
                before["slots"][0]["role"] = "crafting_result"
            bridge, _session = self.bridge_for_transfer([before, before])
            with self.assertRaises(ValueError):
                example_inventory.transfer(bridge, 10, 15)
            bridge.inventory_action.assert_not_called()

    def test_wait_example_authorizes_only_observe_and_stops_when_decision_arrives(self):
        bridge = mock.Mock()
        bridge.state.return_value = {"connected": True, "tick": 4, "sequence": 7,
                                     "recent_actions": [], "time_ms": 0}
        bridge.goal.return_value = {"action_id": "observe-1"}
        bridge.wait.return_value = {"id": "observe-1", "status": "cancelled"}
        bridge.session.side_effect = lambda **kwargs: ControllerSession(bridge, **kwargs)
        args = argparse.Namespace(url="http://127.0.0.1:8765", game_dir=None, token_file=None,
                                  execute=True, seconds=0.5, ai_delay=0.01)
        with mock.patch.object(example_wait, "DotBridge", return_value=bridge), contextlib.redirect_stdout(io.StringIO()):
            result = asyncio.run(example_wait.run(args))
        self.assertEqual(result, 0)
        bridge.goal.assert_called_once_with({"type": "observe", "max_ticks": 10})
        bridge.stop.assert_called_once_with()
        bridge.heartbeat.assert_called_once_with(1500)

    def test_wait_example_expiry_stops_and_cancels_pending_ai_task(self):
        bridge = mock.Mock()
        bridge.state.return_value = {"connected": True, "tick": 4, "sequence": 7, "recent_actions": []}
        bridge.goal.return_value = {"action_id": "observe-1"}
        bridge.session.side_effect = lambda **kwargs: ControllerSession(bridge, **kwargs)
        args = argparse.Namespace(url="http://127.0.0.1:8765", game_dir=None, token_file=None,
                                  execute=True, seconds=0.1, ai_delay=60)
        cancelled = []

        async def pending(*_args):
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                cancelled.append(True)
                raise

        with mock.patch.object(example_wait, "DotBridge", return_value=bridge), \
                mock.patch.object(example_wait, "decidir", side_effect=pending), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SessionExpired):
                asyncio.run(example_wait.run(args))
        self.assertEqual(cancelled, [True])
        bridge.stop.assert_called_once_with()
        self.assertEqual(bridge.goal.call_count, 1)


if __name__ == "__main__":
    unittest.main()
