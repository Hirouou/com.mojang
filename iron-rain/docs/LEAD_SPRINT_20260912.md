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
8. Multiplayer priority remains max 3 crew per Mamute: local player + at most two visible remote crew.

## Work already landed by LEAD in this sprint

- Mobile Safari audio wake hardened in `modules/war-audio.js` (resume interrupted/suspended states and prime output on a user gesture).
- Installed/PWA app keeps the same URL and uses network-first refresh; service-worker cache version has been bumped so the home-screen icon can receive current modules.
- `modules/loader-arm.js`: visual-only articulated robotic loader choreography (grab -> lift -> rotate -> align -> ram -> lock). This exists specifically to replace straight-line/floating shell presentation. Consume it in the cabin renderer; do not recreate a competing loader clock.
- `modules/maintenance-feedback.js`: presentation state for extinguisher spray, repair progress ring, repair motion/sparks and danger pulse. Engine rules stay in `engine-system.js`; renderer/UI should consume this helper instead of duplicating timings.
- `modules/crew-replication.js`: transport-agnostic three-seat replication state (1 local + 2 remotes), ordered packets, stale-peer pruning and renderer from/to samples. It intentionally does NOT choose WebSocket/WebRTC authority.
- Focused tests exist for the three helpers under `tests/`.

## Next integration order — do not duplicate helpers

### FP VISUALS + AUDIO
1. Integrate `loaderArmPose()` into `cabin-view.js` with an actual articulated low-poly arm. The shell must appear physically clamped to the arm during transfer; do not keep a second free-floating shell path.
2. Integrate `maintenanceFeedback()` into the cabin: visible extinguisher cone/foam while `kind === 'extinguish'`; visible circular/progress cue for both extinguish and repair; subtle repair tool/mechanical motion while repairing.
3. Preserve the PS1/low-poly dirty military aesthetic. Do not add glossy futuristic UI.

### FP SYSTEMS
1. Consume the existing `crew-visual-layer.js` and expose a tiny cabin API for remote crew snapshots; max two remote avatars, no networking inside the renderer.
2. Keep direct physical handwheel interaction working on mobile and desktop. If adjusting it, the physical 3D wheels remain the primary interaction target while at the aim station.
3. Fix only clear floating/misaligned props while touching the relevant area; do not refactor the entire scene concurrently.

### MULTIPLAYER FOUNDATION
1. Consume `crew-replication.js` rather than inventing another presence state.
2. Next architecture layer is session/transport adapter -> `crew-replication` -> `crew-visual-layer` -> cabin avatars.
3. Never allow remote input to drive local camera/movement. Do not add a fourth crew slot.

### TABLE MAP / MOBILE
Tune touch precision rather than redesigning the map. Preferred behavior: small deadzone, lower drag gain on coarse pointers, tap-to-place remains precise, pinch stays anchored. Desktop mouse behavior should remain fast.

## Testing / reporting

- Before a shared-file edit, refetch latest active branch and recent commits.
- Small coherent integration slices are preferred over disconnected micro-adjustments.
- If a user-facing change cannot be verified visually in the runtime, state that explicitly; do not invent screenshots.
- Same stable Pages/PWA URL is the product URL. Do not create a replacement user URL for ordinary updates.
