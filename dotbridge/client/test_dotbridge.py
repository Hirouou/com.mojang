"""Testes do cliente contra um servidor HTTP local controlado.

    python3 -m unittest discover -s client -v
"""

import contextlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest import mock

from dotbridge import ActionTimeout, ControllerSession, DotBridge, DotBridgeError, SessionExpired, main


class LocalServer:
    def __init__(self):
        self.requests = []
        self.responses = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.respond()

            def do_POST(self):
                self.respond()

            def respond(self):
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length)
                owner.requests.append((self.command, self.path, dict(self.headers), body))
                response = owner.responses.pop(0) if owner.responses else (200, {"ok": True})
                status, payload, *options = response
                options = options[0] if options else {}
                if options.get("delay"):
                    time.sleep(options["delay"])
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                for name, value in options.get("headers", {}).items():
                    self.send_header(name, value)
                self.end_headers()
                raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
                try:
                    self.wfile.write(raw)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class ClientTests(unittest.TestCase):
    def test_new_goal_heartbeat_events_inventory_routes_and_auth(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="local-secret")
            calls = [
                (lambda: client.heartbeat(), "POST", "/v1/heartbeat", {"ttl_ms": 3000}),
                (lambda: client.goal({"type": "observe", "max_ticks": 100}), "POST", "/v1/goal",
                 {"type": "observe", "max_ticks": 100}),
                (lambda: client.events(17), "GET", "/v1/events?after=17", None),
                (client.inventory, "GET", "/v1/inventory", None),
                (lambda: client.inventory_action({"type": "inventory", "operation": "open"}),
                 "POST", "/v1/inventory", {"type": "inventory", "operation": "open"}),
            ]
            for call, method, path, body in calls:
                call()
                recorded = server.requests[-1]
                self.assertEqual(recorded[0:2], (method, path))
                self.assertEqual(recorded[2]["Authorization"], "Bearer local-secret")
                self.assertEqual(json.loads(recorded[3]) if recorded[3] else None, body)

    def test_new_payload_limits_reject_before_sending(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            for call in (lambda: client.heartbeat(499), lambda: client.heartbeat(10001),
                         lambda: client.heartbeat(True), lambda: client.heartbeat(1000.0),
                         lambda: client.events(-1), lambda: client.events(True),
                         lambda: client.events(2**63), lambda: client.goal([]),
                         lambda: client.inventory_action(None),
                         lambda: client.goal({"type": "look_at", "target": {"x": float("nan")}})):
                with self.assertRaises(ValueError):
                    call()
            self.assertEqual(server.requests, [])

    def test_cli_new_routes_raw_json_and_invalid_json(self):
        with LocalServer() as server, tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / "token"
            token.write_text("cli-secret")
            options = ["--url", server.url, "--token-file", str(token)]
            for args, path, payload in [
                (["heartbeat", "--ttl-ms", "1500"], "/v1/heartbeat", {"ttl_ms": 1500}),
                (["goal", '{"type":"observe","max_ticks":100}'], "/v1/goal", {"type": "observe", "max_ticks": 100}),
                (["events", "--after", "4"], "/v1/events?after=4", None),
                (["inventory"], "/v1/inventory", None),
                (["inventory-action", '{"type":"inventory","operation":"open"}'],
                 "/v1/inventory", {"type": "inventory", "operation": "open"}),
            ]:
                with contextlib.redirect_stdout(io.StringIO()):
                    result = main(options + args)
                self.assertEqual(result, 0)
                self.assertEqual(server.requests[-1][1], path)
                self.assertEqual(json.loads(server.requests[-1][3]) if payload else None, payload)
            before = len(server.requests)
            for raw in ("[]", "null", "{bad", '{"max_ticks":NaN}'):
                with contextlib.redirect_stderr(io.StringIO()) as error:
                    result = main(options + ["goal", raw])
                self.assertEqual(result, 1)
                self.assertIn("JSON", error.getvalue())
                self.assertNotIn("cli-secret", error.getvalue())
            self.assertEqual(len(server.requests), before)

    def test_wait_treats_executing_goal_as_pending_and_returns_failure(self):
        with LocalServer() as server:
            server.responses.extend([
                (200, {"connected": True, "recent_actions": [{"id": "g", "status": "accepted"}]}),
                (200, {"connected": True, "recent_actions": [{"id": "g", "status": "executing"}]}),
                (200, {"connected": True, "recent_actions": [{"id": "g", "status": "failed", "reason": "target_lost"}]}),
            ])
            result = DotBridge(server.url, token="secret").wait("g", poll_interval=0.01)
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["reason"], "target_lost")
            self.assertEqual(len(server.requests), 3)

    def test_session_renews_only_when_pumped_and_never_after_finite_deadline(self):
        bridge = mock.Mock()
        with mock.patch("dotbridge.time.monotonic", return_value=10) as clock:
            session = ControllerSession(bridge, max_seconds=2, ttl_ms=3000)
            with session:
                bridge.heartbeat.assert_called_once_with(3000)
                clock.return_value = 10.5
                session.pump()
                self.assertEqual(bridge.heartbeat.call_count, 1)
                clock.return_value = 11.2
                # Advancing time alone does not create background renewals.
                self.assertEqual(bridge.heartbeat.call_count, 1)
                session.pump()
                self.assertEqual(bridge.heartbeat.call_count, 2)
                clock.return_value = 12
                with self.assertRaises(SessionExpired):
                    session.pump()
                bridge.stop.assert_called_once_with()
                self.assertTrue(session.closed)
                with self.assertRaises(SessionExpired):
                    session.pump()
                self.assertEqual(bridge.heartbeat.call_count, 2)
            self.assertEqual(bridge.stop.call_count, 1)

    def test_session_wait_pumps_and_stops_on_context_exit(self):
        bridge = DotBridge(token="secret")
        bridge._request = mock.Mock(side_effect=[
            {"connected": True, "last_action": {"id": "goal", "status": "executing"}},
            {"connected": True, "last_action": {"id": "goal", "status": "completed"}},
        ])
        bridge.heartbeat = mock.Mock(return_value={"ok": True})
        bridge.stop = mock.Mock(return_value={"ok": True})
        with bridge.session(max_seconds=2, ttl_ms=500) as session:
            session.pump = mock.Mock(wraps=session.pump)
            result = session.wait("goal", timeout=1, poll_interval=0.01)
            self.assertEqual(result["status"], "completed")
            self.assertEqual(session.pump.call_count, 2)
        bridge.stop.assert_called_once_with()

    def test_session_exception_cleans_up_without_hiding_original_failure(self):
        bridge = mock.Mock()
        bridge.stop.side_effect = DotBridgeError("offline")
        session = ControllerSession(bridge, max_seconds=1)
        with self.assertRaisesRegex(ValueError, "original"):
            with session:
                raise ValueError("original")
        self.assertTrue(session.closed)
        self.assertIsInstance(session.stop_error, DotBridgeError)
        bridge.stop.assert_called_once_with()

    def test_session_rejects_unbounded_or_invalid_lease_settings(self):
        for kwargs in ({"max_seconds": float("inf")}, {"max_seconds": 0}, {"max_seconds": 301},
                       {"ttl_ms": 499}, {"ttl_ms": 10001}, {"ttl_ms": True}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                ControllerSession(mock.Mock(), **kwargs)

    def test_health_does_not_require_or_send_token(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token_path="/missing/token")
            self.assertTrue(client.health()["ok"])
            self.assertNotIn("Authorization", server.requests[0][2])

    def test_token_file_and_control_payload(self):
        with tempfile.TemporaryDirectory() as directory, LocalServer() as server:
            token = Path(directory) / "config" / "dotbridge.token"
            token.parent.mkdir()
            token.write_text("unit-test-secret\n")
            server.responses.append((202, {"ok": True, "action_id": "action-1"}))
            client = DotBridge(server.url, game_dir=directory)
            result = client.control(forward=1, strafe=-1, jump=True, ticks=20)
            self.assertEqual(result["action_id"], "action-1")
            method, path, headers, raw = server.requests[0]
            self.assertEqual((method, path), ("POST", "/v1/action"))
            self.assertEqual(headers["Authorization"], "Bearer unit-test-secret")
            self.assertEqual(headers["Content-Type"], "application/json")
            self.assertEqual(json.loads(raw), {
                "type": "control", "forward": 1, "strafe": -1, "jump": True,
                "sneak": False, "sprint": False, "attack": False, "use": False, "ticks": 20,
            })

    def test_observe_radius_and_short_actions(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            client.observe(3)
            self.assertEqual(server.requests[0][1], "/v1/observe?radius=3")
            for call, expected in [
                (lambda: client.look(90, -20), {"type": "look", "yaw": 90, "pitch": -20}),
                (lambda: client.hotbar(9), {"type": "hotbar", "slot": 9}),
                (lambda: client.attack(3), {"type": "attack", "ticks": 3}),
                (lambda: client.use(4), {"type": "use", "ticks": 4}),
                (client.stop, {"type": "stop"}),
            ]:
                call()
                self.assertEqual(json.loads(server.requests[-1][3]), expected)

    def test_camera_defaults_to_f5_cycle_and_accepts_each_perspective(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            client.camera()
            self.assertEqual(json.loads(server.requests[-1][3]), {"type": "camera", "mode": "cycle"})
            for mode in ("first_person", "third_person_back", "third_person_front"):
                client.camera(mode)
                self.assertEqual(json.loads(server.requests[-1][3]), {"type": "camera", "mode": mode})
            self.assertTrue(all(request[1] == "/v1/action" for request in server.requests))

    def test_camera_rejects_unknown_or_non_string_mode_before_sending(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            for mode in ("", "third_person", "F5", "CYCLE", None, True, {}, []):
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    client.camera(mode)
            self.assertEqual(server.requests, [])

    def test_cli_camera_default_explicit_mode_and_wait(self):
        with LocalServer() as server, tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / "token"
            token.write_text("cli-secret")
            options = ["--url", server.url, "--token-file", str(token)]
            for flags, expected_mode in [([], "cycle"), (["--mode", "third_person_back"], "third_person_back")]:
                with contextlib.redirect_stdout(io.StringIO()):
                    code = main(options + ["camera"] + flags)
                self.assertEqual(code, 0)
                self.assertEqual(json.loads(server.requests[-1][3]), {"type": "camera", "mode": expected_mode})
            server.responses.extend([
                (202, {"ok": True, "action_id": "camera-1"}),
                (200, {"connected": True, "last_action": {"id": "camera-1", "status": "completed"}}),
            ])
            with contextlib.redirect_stdout(io.StringIO()) as output:
                code = main(options + ["camera", "--mode", "first_person", "--wait"])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(output.getvalue()), {"id": "camera-1", "status": "completed"})
            self.assertEqual(json.loads(server.requests[-2][3]), {"type": "camera", "mode": "first_person"})
            self.assertEqual(server.requests[-1][1], "/v1/state")

    def test_limits_reject_before_sending(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            for call in [
                lambda: client.control(ticks=0), lambda: client.control(ticks=201),
                lambda: client.control(ticks=True), lambda: client.control(forward=float("nan")),
                lambda: client.control(strafe=2), lambda: client.control(jump=1),
                lambda: client.control(attack=True, use=True), lambda: client.control(forward=10**1000),
                lambda: client.look(0, 91), lambda: client.look(float("inf"), 0),
                lambda: client.hotbar(0), lambda: client.hotbar(10), lambda: client.hotbar(1.5),
                lambda: client.observe(0), lambda: client.observe(9), lambda: client.attack(-1),
                lambda: client.use("5"), lambda: client.wait("x", timeout=-1),
            ]:
                with self.assertRaises(ValueError):
                    call()
            self.assertEqual(server.requests, [])

    def test_only_local_http_urls(self):
        for url in [
            "http://example.org:8765", "https://127.0.0.1:8765", "file:///tmp/token",
            "http://127.0.0.1:8765@evil.org", "http://user:pass@127.0.0.1:8765",
            "http://127.0.0.1:8765/v1", "http://127.0.0.1:99999",
            "http://127.0.0.1:8765?token=secret", "http://127.0.0.1:8765#frag",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                DotBridge(url)
        for url in ["http://localhost:8765", "http://127.0.0.1:8765/", "http://[::1]:8765"]:
            DotBridge(url)

    def test_missing_token_is_friendly_and_sends_nothing(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token_path="/missing/token")
            with self.assertRaisesRegex(DotBridgeError, "--game-dir"):
                client.state()
            self.assertEqual(server.requests, [])

    def test_error_preserves_status_and_redacts_token(self):
        with LocalServer() as server:
            server.responses.append((401, {"ok": False, "error": "bad unit-test-secret"}))
            with self.assertRaises(DotBridgeError) as caught:
                DotBridge(server.url, token="unit-test-secret").state()
            self.assertEqual(caught.exception.status, 401)
            self.assertNotIn("unit-test-secret", str(caught.exception))
            self.assertIn("Confira o token", str(caught.exception))

    def test_redirect_is_not_followed(self):
        with LocalServer() as server, LocalServer() as destination:
            server.responses.append((302, {}, {"headers": {"Location": destination.url + "/leak"}}))
            with self.assertRaises(DotBridgeError) as caught:
                DotBridge(server.url, token="secret").state()
            self.assertEqual(caught.exception.status, 302)
            self.assertEqual(destination.requests, [])

    def test_invalid_and_oversized_json(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            for payload in (b"<html>wrong server</html>", b"[]"):
                server.responses.append((200, payload))
                with self.assertRaises(DotBridgeError):
                    client.state()
            client.MAX_RESPONSE = 20
            server.responses.append((200, {"large": "x" * 50}))
            with self.assertRaisesRegex(DotBridgeError, "tamanho"):
                client.state()

    def test_http_timeout_is_bounded(self):
        with LocalServer() as server:
            server.responses.append((200, {}, {"delay": 0.2}))
            start = time.monotonic()
            with self.assertRaises(DotBridgeError):
                DotBridge(server.url, token="secret", timeout=0.03).state()
            self.assertLess(time.monotonic() - start, 0.15)

    def test_wait_tracks_id_and_history(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            server.responses.extend([
                (200, {"connected": True, "last_action": {"id": "other", "status": "completed"}}),
                (200, {"connected": True, "active_action": {"id": "x", "remaining_ticks": 3}}),
                (200, {"connected": True, "last_action": {"id": "other", "status": "completed"},
                       "recent_actions": [{"id": "x", "status": "completed"}]}),
            ])
            result = client.wait("x", timeout=1, poll_interval=0.01)
            self.assertEqual(result, {"id": "x", "status": "completed"})
            self.assertEqual(len(server.requests), 3)

    def test_wait_returns_explicit_cancellation(self):
        with LocalServer() as server:
            server.responses.append((200, {"connected": True, "last_action": {
                "id": "x", "status": "cancelled", "reason": "replaced",
            }}))
            result = DotBridge(server.url, token="secret").wait("x")
            self.assertEqual(result["status"], "cancelled")

    def test_wait_unknown_id_times_out_and_disconnect_errors(self):
        with LocalServer() as server:
            client = DotBridge(server.url, token="secret")
            start = time.monotonic()
            with self.assertRaises(ActionTimeout):
                client.wait("lost", timeout=0.04, poll_interval=0.01)
            self.assertLess(time.monotonic() - start, 0.15)
            server.responses.append((200, {"connected": False}))
            with self.assertRaisesRegex(DotBridgeError, "saiu do mundo"):
                client.wait("lost", timeout=1)

    def test_cli_defaults_to_state_and_errors_use_stderr(self):
        with LocalServer() as server, tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / "token"
            token.write_text("cli-secret")
            with contextlib.redirect_stdout(io.StringIO()) as output:
                code = main(["--url", server.url, "--token-file", str(token)])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(output.getvalue()), {"ok": True})
            self.assertEqual(server.requests[0][1], "/v1/state")
            with contextlib.redirect_stderr(io.StringIO()) as error:
                code = main(["--url", server.url, "--token-file", str(token), "hotbar", "10"])
            self.assertEqual(code, 1)
            self.assertIn("Erro:", error.getvalue())
            self.assertNotIn("cli-secret", error.getvalue())


if __name__ == "__main__":
    unittest.main()
