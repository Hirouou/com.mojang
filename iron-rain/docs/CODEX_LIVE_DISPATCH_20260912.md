# IRON RAIN — CODEX LIVE DISPATCH — 2026-09-12

This file is the live coordination board while the Codex P0 multiplayer mission is running. Read it together with `GITHUB_HANDOFF.md`, `ACTIVE_USER_DIRECTIVES_20260912.md`, `MULTI_AGENT_CONTROL.md`, `LEAD_SPRINT_20260912.md`, `POST_CODEX_ROUTING_20260912.md`, `AGENT_LOG.md` and the active Codex requests.

## OWNER OVERRIDE — 21:32 BRT
Iron Rain is ONLINE-FIRST and SERVER-AUTHORITATIVE. No player/browser owns the persistent war. Any older `host creates room`, `host + guests` or `single-player fallback` language is legacy transport wording only and must not define the final architecture.

The server/backend owns the theatre and persistent Mamute state. ALIADOS and EIXO share the same theatre in different faction-bound Mamutes. A Mamute may have 0–3 connected crew and still remains an entity of the war. Leaving the vehicle/game never resets the theatre.

The next meaningful combat checkpoint is now explicit: player A in an ALIADOS Mamute and player B in an EIXO Mamute, same persistent theatre; A fires, shared authority validates command/station/ammo and resolves impact/damage exactly once, then both clients receive the same result.

## OVERNIGHT EXECUTION GATE — ALL AGENTS
Every scheduled execution must now aim for a LARGE INTEGRATED SLICE, not a micro-helper. A cycle counts as complete only if it produces either:
- a player-visible/testable change on the live path; OR
- a structural integration directly required for persistent server authority / multi-Mamute combat.

Tests and helpers are supporting work, not the headline result. Once a foundation exists, the next cycle should consume it. If a hotspot is occupied, take an adjacent high-impact integration instead of waiting. Record concrete blockers only when they are real and reproducible.

### FP VISUALS + AUDIO — HIGH URGENCY
The owner explicitly reports that visual progress is not perceptible enough. Overnight visual cycles must change the rendered/audio experience, not only add tests/contracts.
Priority order:
1. consume the existing loader arm in the real cabin renderer and remove the magical/legacy reload presentation;
2. integrate shared hull-hit feedback visibly/audibly in the cabin: shake + light/dust/metal + crack/thump/rattle scaled by damage;
3. show extinguisher spray/foam and mechanical repair feedback/progress in the real interior;
4. fix floating/misaligned props and improve industrial depth/readability without replacing the cabin renderer;
5. preserve mobile physical 3D AIM controls, compact CARGA/DISPARAR and desktop behavior.

A visual cycle that only adds a presentation test without changing the rendered path is incomplete unless it fixes a P0 regression blocking the build.

## Active gates

### Codex P0 transport / multiplayer
Codex owns the real cross-device transport/integration audit in `docs/codex-requests/IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` while `IN_PROGRESS`.

No other agent may build a competing transport/signaling/lobby stack or alternate network authority. Agents may prepare/consume independent seams and integrate visible systems around it.

### Codex P0 persistent world authority
`docs/codex-requests/IR-CODEX-20260912-1620-LEAD-persistent-war-authority.md` is the persistent-server/backend half of the same P0 direction. It must not recommend player-host world authority.

## What must be proven before LEAD calls multiplayer/server direction ready

### Phase 1 — same Mamute / crew
1. PC -> PC real transport without raw SDP/manual signaling.
2. PC -> phone/mobile on the same supported path.
3. 1, 2 and 3 occupants work; 4th occupant is rejected.
4. Faction lock: opposite faction cannot enter the same Mamute.
5. Station exclusivity: different stations simultaneous; same station rejected.
6. Disconnect releases station/presence; reconnect does not duplicate avatar/seat/authority.
7. Remote pose reaches existing runtime/replication/visual chain; packets never move local camera/input.
8. Shared Mamute fire/reload/impact/maintenance has one authoritative outcome and does not double-fire per client.

### Phase 2 — persistent theatre / opposing Mamutes
9. ALIADOS and EIXO clients connect to the SAME theatre id.
10. Each faction can have its own Mamute in that theatre; creating a Mamute never creates a new war.
11. Mamute identity/state survives crew disconnect.
12. A fire command is validated by shared authority, consumes ammo exactly once and produces one projectile/outcome.
13. Target Mamute damage/impact is resolved once and both clients receive the same result.
14. Disconnecting all crew does not reset territory/Mamutes/theatre snapshot.
15. Reconnect reconstructs a consistent persistent snapshot.
16. Public-test statement: clearly say whether a real friend can test cross-device now; otherwise name the exact backend/infrastructure blocker.

Failures in Phase 1 or absence of a concrete Phase 2 authority path remain P0.

## While Codex transport is still IN_PROGRESS — routing by workstream

### FP SYSTEMS
- Keep one canonical crew runtime/bridge only.
- Harden presence/station cleanup on leave/error/reconnect.
- Prepare consumers for server-assigned theatre/Mamute identity; do not put network code in cabin renderer/controls.
- Do not resurrect an offline/single-player cabin path; one-player means one connected crew member.

### FP VISUALS + AUDIO
- Execute the high-urgency visible list above.
- Remote players remain one low-poly body each, maximum two remotes visible inside one Mamute.
- Shared impacts/reload/maintenance must be presentation of canonical events, never alternate authority.

### WORLD WAR
- One canonical persistent theatre shared by both factions.
- Large hex regions + internal sectors; coherent front; neutral/disputed corridor.
- Multiple Mamutes are independent faction-bound entities in the same theatre.
- Each Mamute record carries stable id, faction, strategic region/sector, crew occupancy, deployment state, finite ammo/health reference/state.
- Build toward serializable snapshot + event/command seams; `persistent-war-clock.js` remains scheduler only.
- No regular force deployment behind enemy lines except explicit raid/recon/partisan/infiltration.

### COMBAT AI
- Consume canonical territory/logistics/intel in the live simulation.
- Same rules for both factions.
- No magical reserves/construction/ammo.
- Prepare target/engagement results to consume authoritative Mamute/world events rather than local client truth.

### ARTILLERY
- Preserve mobile physical 3D AIM.
- Keep compact CARGA +/- and DISPARAR on touch.
- One station-gated aim/load/fire chain only.
- Fire must be representable as a server command with dedupe/idempotency and finite-ammo consumption.
- Prepare a cross-faction Mamute-vs-Mamute test path without duplicating local/remote shots.

## Automatic routing when Codex returns
Every agent checks both Codex requests before choosing the next task.

If transport returns `DONE`:
1. LEAD/FP SYSTEMS consumes returned adapter/API and runs the Phase 1 matrix on the real game path.
2. WORLD WAR/Persistent authority immediately binds the transport to one shared theatre and persistent Mamute identities.
3. ARTILLERY wires canonical fire command/result flow to shared authority.
4. FP VISUALS + AUDIO makes remote/impact/reload/maintenance results perceptible from those canonical events.
5. WORLD WAR exposes faction-eligible Mamutes in the same theatre/map.
6. COMBAT AI consumes the same territory/logistics/world state.
7. LEAD runs the Phase 2 opposing-Mamute checkpoint.

If transport returns `BLOCKED`:
1. LEAD records the exact blocker.
2. No agent invents random competing transport.
3. Persistent-authority request must recommend the minimum backend/service that solves the blocker while preserving GitHub Pages client and no secret in browser.
4. Visuals/World War/Combat AI/Artillery continue large independent integrated slices.

## Target player flow
`ABRIR JOGO -> CONECTAR AO SERVIDOR/THEATRE -> ESCOLHER FACÇÃO -> VER GUERRA/MAPA -> ESCOLHER MAMUTE ELEGÍVEL ou CRIAR NOVO MAMUTE NA MESMA GUERRA -> ENTRAR -> OCUPAR POSTO`

Rules:
- ALIADOS and EIXO share one persistent theatre.
- Mamute belongs to one faction.
- Maximum 3 crew per Mamute.
- New Mamute = new vehicle in existing war, never a new war instance.
- Opposite faction cannot enter that Mamute but can occupy/create its own vehicle in the same theatre.
- Strategic position corresponds to a real region/sector.
- Zero crew does not erase or pause the war.

## User relay rule
The owner must not relay Codex output manually. Codex writes to GitHub; all agents consume the result from the shared docs/requests and continue automatically.
