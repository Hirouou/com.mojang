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
8. Multiplayer is P0: max 3 crew per Mamute, local player + at most two visible remote crew, with real cross-device transport as the next hard milestone.
9. Two players must never operate the same physical station/control surface at the same time. Station ownership is exclusive and must release on leave/disconnect.
10. Multiplayer needs a real player-facing lobby: create match / enter code / play alone / enter the Mamute. Do not expose technical signaling.
11. External hits on the Mamute must be felt by crew inside through hull audio, shake/light/dust feedback, regardless of which player is driving/firing.
12. The war must not belong to the crew host. Long-term world authority must keep the theatre advancing if a player leaves and eventually while no specific crew client is online.
13. Territory/front topology must be coherent: one continuous ownership line, ally territory on one side and enemy territory on the other. Do not scatter independent fronts behind each other.
14. Territory development is logistics-gated: secure control -> truck delivery -> construction. Bases, walls, mortars, garages and factories cannot appear from timers alone. Cut routes stop deliveries/building. Factories produce transferable material which still has to travel.

## Work already landed by LEAD in this sprint

- Mobile Safari audio wake hardened in `modules/war-audio.js`; another audio pass later coalesced pending mobile wake calls. Real iPhone QA remains mandatory.
- Installed/PWA app keeps the same URL and uses network-first refresh; service-worker cache was bumped so the home-screen icon can receive current modules.
- Mobile cabin clarity pass landed in `style-v7.css`.
- Table-map touch precision is integrated through `modules/map-touch-precision.js`.
- `modules/loader-arm.js`: visual-only articulated robotic loader choreography. Consume it; do not recreate a competing loader clock.
- `modules/maintenance-feedback.js` + `modules/maintenance-overlay.js`: repair/extinguisher progress and visible overlay feedback. Cabin 3D foam/tool geometry can still enhance this later.
- `modules/crew-replication.js`: transport-agnostic three-seat replication state (1 local + 2 remotes), ordered packets, stale-peer pruning and renderer from/to samples.
- `modules/crew-session.js`: host-authoritative crew protocol with handshake, room isolation, heartbeat, three-seat cap and pose cadence. Remote time is normalized to local receipt time for interpolation.
- `modules/crew-runtime.js`: stable transport adapter boundary. Sockets/WebRTC must stay outside cabin/camera code.
- `modules/crew-broadcast-transport.js`: same-origin QA transport only. Never call this public multiplayer.
- `modules/crew-station-authority.js`: exclusive physical-station claims. `crew-session.js` now carries station request/release/state packets so the host serializes station ownership; a disconnected peer releases its stations.
- `modules/crew-lobby-ui.js`: player-facing three-seat lobby component prepared with mobile/desktop styling and create/join/offline/enter-Mamute actions. It intentionally does not choose a transport.
- `modules/cabin-hit-feedback.js`: presentation contract for external hull impacts heard/felt inside (shake, lamp flicker, dust, rattle, low thump/crack). Integrate with `war-audio.js` + cabin renderer rather than inventing a second hit system.
- `modules/theatre-control.js`: one continuous strategic control line plus ally/enemy/contested ownership classification and local line-shift operation after captures.
- `modules/theatre-sectors.js`: coherent tactical sector seeds along that same control line, with hostile assets deeper on the enemy side.
- `modules/territory-development.js`: secure-time gates, physical delivered stock, outpost/depot/mortar/bunker/garage/factory projects, route-paused construction, factory material production and physical supply-convoy progression.
- `modules/persistent-war-clock.js`: wall-clock strategic catch-up primitive independent of requestAnimationFrame/performance.now(). Persistence/backend authority remains outside this helper.
- Focused tests exist for the new crew-station, theatre, territory/logistics, persistent-clock and hull-feedback helpers.
- Codex P0 request `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` is queued for real cross-device transport/signaling.
- Codex P1 request `IR-CODEX-20260912-1620-LEAD-persistent-war-authority.md` is queued to separate persistent world authority from crew-host authority after/alongside the transport decision.

## Next integration order — do not duplicate helpers

### P0 MULTIPLAYER — CURRENT TOP PRIORITY
1. Integrate `createCabinCrewVisualLayer()` into `cabin-view.js` and expose the smallest possible API for renderer-ready remote samples. Maximum two remote avatars. No network code in renderer.
2. Wire `crew-runtime.js` into `game-v6.js`: local cabin crew pose -> runtime update -> runtime render samples -> cabin visual layer. Keep single-player behavior identical while offline.
3. Consume `crew-session` station claims in actual station entry: request exclusive ownership before entering `drive/aim/load/map/radio/engine/extinguisher`; if occupied, show who is using it and do not engage controls. Release on leave/disconnect.
4. Mount `crew-lobby-ui.js` as the real entry flow. Required UX: CRIAR PARTIDA, ENTRAR by short code, JOGAR SOZINHO, ENTRAR NO MAMUTE.
5. Replace QA BroadcastChannel with the real cross-device adapter selected/implemented by Codex P0. Preserve the same session/runtime API.
6. Acceptance checkpoint: two real devices host/join, see each other walking, operate different stations simultaneously, cannot steal the same station, share Mamute hit feedback, disconnect cleanly; third can join; fourth is refused.

### SHARED MAMUTE FEEDBACK
1. Consume `cabin-hit-feedback.js` from actual Mamute hit events.
2. `war-audio.js` needs a distinct INSIDE-HULL hit signature: sharp transmitted crack + low metal thump + rattling return, stronger for tank/mortar/battery hits than rifle/HMG.
3. Cabin renderer should consume shake/lampFlicker/dustKick without moving remote players or changing authority. Every local client inside hears/sees the same authoritative Mamute hit event.
4. Driver and gunner actions must coexist: station ownership controls who can issue each command, while shared Mamute state replicates resulting bearing/elevation/drive/hits.

### WORLD / AI / TERRITORY
1. Replace scattered sector seed layout with `theatre-sectors.js`/`theatre-control.js` incrementally. One ordered front boundary only; no ally tactical front behind an enemy front on the same axis.
2. A capture moves/bends a LOCAL portion of the control line; it does not spawn another disconnected front.
3. Bind a territory node to each secured area. Construction requires control + secure time + delivered resources.
4. Spawn/track supply convoys from rear depots/factories. No arrival = no stock = no build. Unsafe/cut route pauses or destroys logistics.
5. Structures should appear by tier: field outpost/trenches -> depot/mortar/bunker -> garage/heavier support -> factory after long secure control. Factories manufacture material; they do not magically upgrade remote sectors.
6. Combat AI should use actual local supply/structures for morale, ammo, reinforcements, armor/support availability. Do not give either side global omniscience or free reinforcements.
7. Shared world time must eventually live under persistent world authority, not the Mamute crew host. Use `persistent-war-clock.js` as scheduler primitive and consume Codex P1 before choosing backend/storage.

### FP VISUALS + AUDIO
1. Integrate `loaderArmPose()` into `cabin-view.js` with an actual articulated low-poly arm; shell physically clamped during transfer.
2. Enhance maintenance with true cabin 3D extinguisher cone/foam/tool motion only without duplicating existing progress overlay.
3. Preserve PS1/low-poly dirty military aesthetic.

### TABLE MAP / MOBILE
The sensitivity complaint is implemented. Only revisit after real mobile testing; adjust coarse-pointer helper instead of redesigning map or slowing mouse.

## Testing / reporting

- Before a shared-file edit, refetch latest active branch and recent commits.
- Multiplayer P0 outranks disconnected micro-polish until the first real two-device checkpoint exists.
- Shared world persistence is NOT complete merely because browser catch-up exists; global continuity requires authoritative storage/backend.
- Do not label a helper/foundation as player-visible integration until it is consumed by the main game path.
- If a user-facing change cannot be verified visually in the runtime, state that explicitly.
- Same stable Pages/PWA URL is the product URL. Do not create a replacement user URL for ordinary updates.
