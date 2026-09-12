# Iron Rain — Multiplayer P0 handoff — 2026-09-12

## Goal for the next public checkpoint

Two real devices must be able to open the same stable Iron Rain URL, one host and one join a short room code, and both must see the other crew member moving inside the same M-47 cabin. The protocol must already allow a third crew member and reject a fourth.

## Existing pipeline — reuse, do not duplicate

1. `cabin-controls.js` -> `cabinCrewPose()` validates physical cabin pose and compartment.
2. `crew-replication.js` -> ordered pose packets, interpolation samples and stale removal.
3. `crew-presence.js` -> collision-safe renderer-facing interpolation, last-safe-pose fallback.
4. `crew-avatar-visual.js` -> preallocated low-poly avatars, maximum 2 remote bodies.
5. `crew-visual-layer.js` -> presence + avatar renderer bridge.
6. `crew-session.js` -> host authority, seats 0/1/2, room isolation, heartbeat, join/leave, 12 Hz pose cadence.
7. `crew-runtime.js` -> pluggable transport boundary. Final network adapter must satisfy `{start(), send(packet), close(), kind, active}`.
8. `crew-broadcast-transport.js` -> QA ONLY for same-browser tabs/PWA instances. It is not internet multiplayer.

## Immediate code integrations

### cabin-view.js
- Import `createCabinCrewVisualLayer`.
- Construct one layer from the existing Three.js `scene`; never create another renderer.
- `update()` should receive renderer-ready remote samples and call the layer once per frame.
- Expose local `crewPose()` from the existing movement controller and a remote crew snapshot for tests.
- `reset()` hides/clears peers; `dispose()` disposes the layer exactly once.
- Do not put session, WebRTC, WebSocket or room logic here.

### game-v6.js
- Create one `crew-runtime` instance outside the renderer.
- Offline mode must behave exactly like current single player.
- Local pose flow: `cabin.crewPose()` -> `runtime.update()`.
- Remote visual flow: `runtime.renderSamples()` -> `cabin.update({ crewRemotes })`.
- Minimal host/join UI can be added after this pipeline works with the QA transport.
- No remote packet may mutate local camera, movement keys, station selection or strategic world state.

## Real transport

Codex P0 mailbox request: `docs/codex-requests/IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md`.

The real adapter must work cross-device with a static GitHub Pages client. Do not expose raw SDP/manual copy-paste to the user. Do not hide private credentials in the client. If a signaling service is required, keep it replaceable behind `crew-runtime.js`.

## Acceptance

- host creates room;
- guest joins by short code;
- guest sees host avatar and host sees guest avatar;
- walking/yaw/pitch update smoothly;
- disconnect removes avatar after leave/timeout;
- third player can join; fourth is refused;
- single-player remains functional with no network configured;
- iPhone/mobile landscape is supported rather than a desktop-only demo.
