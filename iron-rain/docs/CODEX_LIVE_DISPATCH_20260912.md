# IRON RAIN — CODEX LIVE DISPATCH — 2026-09-12

This file is the live coordination board while the Codex P0 multiplayer mission is running. Read it together with `GITHUB_HANDOFF.md`, `ACTIVE_USER_DIRECTIVES_20260912.md`, `MULTI_AGENT_CONTROL.md`, `POST_CODEX_ROUTING_20260912.md`, `AGENT_LOG.md` and the active Codex request.

## Active gate

Codex owns the current real multiplayer transport/integration audit in `docs/codex-requests/IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` while its status is `IN_PROGRESS`.

No other agent may build a competing transport, signaling layer, lobby stack or alternate crew authority while this gate is active. Agents must continue independent work and prepare contracts that consume the Codex result instead of guessing it.

## What Codex must prove before LEAD accepts P0

Evidence should be browser/device based whenever the environment allows. The acceptance matrix is:

1. PC -> PC: host creates a Mamute session and another PC joins without raw SDP/manual signaling.
2. PC -> phone/mobile viewport: same path remains usable and single-player still works when multiplayer is unused.
3. Capacity: 1, 2 and 3 occupants work; the 4th occupant is rejected cleanly.
4. Faction lock: an EIXO player cannot enter an ALIADOS Mamute and vice versa.
5. Same war: choosing ALIADOS/EIXO changes faction membership, not the theatre instance.
6. Station exclusivity: two peers can operate different stations simultaneously, but two peers cannot own the same physical station.
7. Disconnect: station ownership and visual presence release after leave/timeout.
8. Reconnect: a returning peer can rejoin without duplicating avatar, seat or station authority.
9. Pose/presence: remote crew pose reaches the existing `crew-session` / `crew-replication` / visual chain; remote packets never drive local camera/input.
10. Shared Mamute state: shot/reload/impact/maintenance events have one authoritative outcome and do not double-fire per client.
11. Compatibility: desktop mouse path and current mobile physical 3D AIM controls remain intact; mobile must not resurrect duplicate lower azimuth/elevation UI.
12. Public-test statement: Codex must explicitly say whether a real friend on another device can test now; if not, identify the exact blocker and minimal next infrastructure step.

Failures in items 1–7 remain P0. Do not hide them under map/content expansion.

## While Codex is still IN_PROGRESS — allowed preparation by agents

### FP SYSTEMS
- Do not touch Codex-owned transport/signaling hotspots unless fixing a clearly isolated regression.
- Prepare consumers for one canonical crew runtime only.
- Preserve compact local pose -> runtime/session -> renderer sample chain.
- Prepare station claim/release UI states, but do not invent a second authority layer.

### FP VISUALS + AUDIO
- Continue independent loader arm, repair/extinguisher and hull-hit feedback work.
- Remote players must remain one low-poly body each, maximum two remotes visible inside one Mamute.
- Do not tune subjective lighting/audio without real screenshots/device QA.

### WORLD WAR
Prepare the shared-theatre model independently of network transport:
- mandatory first choice: `ALIADOS` blue / `EIXO` green;
- one canonical war shared by both factions;
- large hex regions containing smaller capturable sectors;
- coherent roughly split opening front, not random deep enemy pockets;
- region ownership resolves only when its internal sectors resolve;
- multiple Mamutes are independent entities inside that same theatre, never cloned wars.

Each Mamute record must be able to carry at least: stable vehicle/session id, faction, strategic position/sector, crew occupancy/count, current deployment state and shared finite ammunition reference/state. Do not make the crew host the owner of the global war.

### COMBAT AI
- Derive normal force placement from coherent territory/front ownership.
- Keep both factions on symmetric AI/logistics/construction/reinforcement rules.
- Behind-line enemies require explicit recon/raid/partisan/infiltration behavior.

### ARTILLERY
- Preserve physical 3D AIM controls on mobile.
- Keep only compact `CARGA +/-` and `DISPARAR` at right on touch AIM station.
- Prepare station-gated aim/load/fire calls so a single authoritative action can replicate without duplicate shots/reloads.

## Automatic routing the moment Codex returns

Every agent must check the active Codex request before selecting its next task.

If status becomes `DONE`:
1. LEAD/FP SYSTEMS consumes the returned adapter/API and performs the acceptance matrix above in the real game path.
2. FP SYSTEMS finishes host/join + station claim/release + disconnect/reconnect integration.
3. FP VISUALS + AUDIO validates remote bodies and shared interior feedback, then fixes only evidence-backed visual problems.
4. WORLD WAR connects faction -> eligible Mamute -> session selection to the canonical theatre and begins player-visible large-hex/internal-sector map integration.
5. WORLD WAR introduces multiple faction-bound Mamutes in the SAME theatre: new players may join an eligible existing Mamute or create a new Mamute for their faction.
6. COMBAT AI consumes the coherent territory model for frontline placement and local battle materialization.
7. ARTILLERY gates physical stations through multiplayer authority and verifies one shared ammo/reload/fire outcome.

If status becomes `BLOCKED`:
1. LEAD records the exact blocker, not a generic "multiplayer failed" note.
2. No agent invents a new transport blindly.
3. FP SYSTEMS prepares only the minimum seam required by Codex's recommended next option.
4. WORLD WAR / Combat AI / Artillery / Visuals continue independent work that does not assume the missing transport exists.

## New-player / new-Mamute product flow after P0 transport is accepted

Target entry flow:

`ABRIR JOGO -> ESCOLHER FACÇÃO -> VER GUERRA/MAPA -> ESCOLHER MAMUTE ELEGÍVEL ou CRIAR NOVO MAMUTE -> ENTRAR NA TRIPULAÇÃO -> ESCOLHER/OCUPAR POSTO`

Rules:
- ALIADOS and EIXO remain in the same persistent theatre.
- A Mamute belongs to exactly one faction at a time.
- Maximum 3 crew inside one Mamute.
- A new Mamute is another vehicle in the same war, not a new copy of the war.
- Multiple Mamutes from both factions may coexist on different sectors/fronts.
- A player may not join an opposing-faction Mamute.
- Vehicle position must correspond to a real strategic sector/region, not an arbitrary detached lobby location.
- Disconnecting the last crew member must not reset territorial war state.

## Next meaningful player-visible checkpoint

One player on PC selects ALIADOS, creates a Mamute, and enters it. A second player on another PC or phone selects ALIADOS, sees that Mamute on the same war, joins it, sees the host inside, and takes another station. A third may join; a fourth cannot. An EIXO player sees the same strategic war but cannot enter the ALIADOS Mamute; they can create/join an EIXO Mamute elsewhere on the same map. Multiple Mamutes appear as faction-bound vehicles attached to sectors of a coherent large-region/internal-sector front.

## User relay rule

The project owner must not need to copy Codex output between agents. Codex writes its result to GitHub; agents consume it from GitHub and route work from this file plus `POST_CODEX_ROUTING_20260912.md`.
