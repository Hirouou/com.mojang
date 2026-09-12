# Iron Rain — LEAD active sprint — 2026-09-12

This file is the current short-horizon integration handoff. It does not replace `IRON_RAIN_VISION.md`, `MULTI_AGENT_CONTROL.md` or `AGENT_LOG.md`.

## User-validated problems to fix now

1. iPhone/mobile audio can remain completely silent even with audio ON and volumes high.
2. Table-map touch control feels too sensitive / hard to place precisely.
3. Reload presentation looks fake when the round appears to float into the breech.
4. Extinguisher action needs visible discharge/foam instead of only waiting for fire state to end.
5. Repair needs explicit in-view progress feedback while the player stays at the engine.
6. First-person aiming should let the operator directly grab/turn the physical azimuth/elevation handwheels while reading the instrument panel.
7. Floating/misaligned props and weak mechanical animation inside the Mamute remain a visual priority.
8. Multiplayer is now P0 for the current sprint: max 3 crew per Mamute, local player + at most two visible remote crew, with real cross-device transport as the next hard milestone.

## Work already landed by LEAD in this sprint

- Mobile Safari audio wake hardened in `modules/war-audio.js` (resume interrupted/suspended states and prime output on a user gesture).
- Installed/PWA app keeps the same URL and uses network-first refresh; service-worker cache version has been bumped so the home-screen icon can receive current modules.
- Mobile cabin clarity pass landed in `style-v7.css`: quieter HUD/mission chrome, smaller translucent joystick, compact interaction button, lighter grain and a clearer low-profile reticle/prompt so the actual cabin occupies more of the iPhone screen. Do not recreate a competing mobile HUD pass unless new screenshots show a regression.
- Table-map touch precision is now integrated in `modules/table-map.js` using `modules/map-touch-precision.js`: coarse pointers get an 8 px deadzone, reduced plot/pan drag gain and exact tap-to-place; mouse and anchored pinch behavior remain unchanged. This is now implementation, not pending work.
- `modules/loader-arm.js`: visual-only articulated robotic loader choreography (grab -> lift -> rotate -> align -> ram -> lock). This exists specifically to replace straight-line/floating shell presentation. Consume it in the cabin renderer; do not recreate a competing loader clock.
- `modules/maintenance-feedback.js`: presentation state for extinguisher spray, repair progress ring, repair motion/sparks and danger pulse. Engine rules stay in `engine-system.js`; renderer/UI should consume this helper instead of duplicating timings.
- `modules/maintenance-overlay.js` is now wired through `engine-system.js`: repair/extinguish actions publish live progress and show an in-view circular percentage indicator; extinguisher mode has visible white foam/bubble feedback and repair mode has small mechanical spark feedback. Do not build a second progress overlay. Cabin 3D foam/tool geometry can still be added later as an enhancement.
- `modules/crew-replication.js`: transport-agnostic three-seat replication state (1 local + 2 remotes), ordered packets, stale-peer pruning and renderer from/to samples.
- `modules/crew-session.js`: host-authoritative crew protocol landed. Host is seat 0; only seats 1 and 2 can join; handshake, room isolation, heartbeat, stale-peer removal and pose cadence are centralized here.
- `modules/crew-runtime.js`: stable transport adapter boundary landed. The game can plug any real transport into the same session/replication path without putting sockets/WebRTC inside camera or cabin code.
- `modules/crew-broadcast-transport.js`: same-origin QA transport landed for two tabs/PWA instances in the same browser profile. It is for end-to-end local testing only and must NOT be mistaken for the final internet transport.
- `tests/crew-session.test.js` and `tests/crew-runtime.test.js` cover the three-seat cap, room isolation, handshake, pose flow and transport boundary.
- Codex P0 request `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` is queued for the real cross-device transport/signaling slice when Codex is active. Do not create a duplicate transport request.

## Next integration order — do not duplicate helpers

### P0 MULTIPLAYER — CURRENT TOP PRIORITY
1. Integrate `createCabinCrewVisualLayer()` into `cabin-view.js` and expose the smallest possible API for renderer-ready remote samples. Maximum two remote avatars. No network code in renderer.
2. Wire `crew-runtime.js` into `game-v6.js`: local `cabin.crewPose()`/snapshot pose -> runtime update -> runtime render samples -> cabin visual layer. Keep single-player behavior identical while offline.
3. Add minimal host/join UI only after the runtime path is connected. A short room code is preferred. Do not expose SDP blobs or technical signaling to the player.
4. Replace the QA BroadcastChannel transport with the real cross-device adapter selected/implemented by the P0 Codex mission. Preserve the same session API.
5. Acceptance target for the next public multiplayer checkpoint: two real devices can host/join, see each other walking inside the same Mamute, disconnect cleanly, and a third player can join without allowing a fourth.

### FP VISUALS + AUDIO
1. Integrate `loaderArmPose()` into `cabin-view.js` with an actual articulated low-poly arm. The shell must appear physically clamped to the arm during transfer; do not keep a second free-floating shell path.
2. Enhance the already-landed maintenance overlay with true cabin 3D extinguisher cone/foam/tool motion only if it can be done without duplicating the progress overlay.
3. Preserve the PS1/low-poly dirty military aesthetic. Do not add glossy futuristic UI.

### FP SYSTEMS
1. Multiplayer cabin integration takes precedence over unrelated micro-polish until remote crew are visible through the real renderer path.
2. Keep direct physical handwheel interaction working on mobile and desktop. If adjusting it, the physical 3D wheels remain the primary interaction target while at the aim station.
3. Fix only clear floating/misaligned props while touching the relevant area; do not refactor the entire scene concurrently.

### TABLE MAP / MOBILE
The sensitivity complaint is implemented now. Only revisit after real mobile testing. If further tuning is needed, adjust the coarse-pointer helper rather than redesigning the map or touching desktop mouse behavior.

## Testing / reporting

- Before a shared-file edit, refetch latest active branch and recent commits.
- Multiplayer P0 outranks disconnected micro-adjustments until the first real two-device checkpoint exists.
- Small coherent integration slices are preferred over disconnected micro-adjustments.
- If a user-facing change cannot be verified visually in the runtime, state that explicitly; do not invent screenshots.
- Same stable Pages/PWA URL is the product URL. Do not create a replacement user URL for ordinary updates.
