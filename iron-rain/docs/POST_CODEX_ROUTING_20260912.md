# IRON RAIN — POST-CODEX ROUTING — 2026-09-12

This is the execution map for all agents after the current Codex P0 multiplayer mission returns. Read it together with `GITHUB_HANDOFF.md`, `ACTIVE_USER_DIRECTIVES_20260912.md`, `MULTI_AGENT_CONTROL.md`, `LEAD_SPRINT_20260912.md`, `AGENT_LOG.md` and the Codex result file.

## Current Codex gate

Active mission: `docs/codex-requests/IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md`.

Do not duplicate or replace that work while it is `IN_PROGRESS`.

When its status becomes `DONE` or `BLOCKED`, every slot must consume the returned evidence before choosing new work. The user is not a relay between Codex and the agents.

## Immediate acceptance gate after Codex returns

Before expanding scope, LEAD/FP Systems verifies the returned transport in the real game path:

1. two devices/instances can join the same Mamute;
2. same faction is required for the same Mamute;
3. opposite faction is rejected from that vehicle/session;
4. maximum crew is 3 total players;
5. two players can use different stations simultaneously;
6. the same physical station cannot be owned by two players;
7. disconnect/reconnect releases and restores authority cleanly;
8. remote crew presence is visible in first person;
9. shared Mamute events reach all crew: fire/reload/hull hit/maintenance state as applicable;
10. single-player remains unchanged when multiplayer is not used.

If any of 1–7 fails, it remains P0 and feature expansion must not hide the failure.

## Workstream routing after Codex result

### FP SYSTEMS — multiplayer integration / player presence

Owner goal: turn Codex transport into actual player-facing crew flow without parallel network stacks.

After `DONE`:
- consume the exact adapter/API returned by Codex; do not recreate signaling;
- finish the main `game-v6.js` runtime chain if still incomplete;
- enforce station claim/release for drive/aim/load/map/radio/engine/extinguisher;
- verify local camera/input never comes from remote packets;
- ensure disconnect removes remote avatar and releases station;
- keep 1 local + at most 2 remote crew;
- add/repair clear player feedback for occupied station, disconnected peer and full Mamute.

After `BLOCKED`:
- do not invent another transport blindly;
- consume Codex's concrete blocker/recommendation;
- keep local/session/runtime integration testable with the existing transport abstraction;
- prepare only the minimum code seam needed for the recommended next transport option.

### FP VISUALS + AUDIO — remote crew + shared interior feedback

Owner goal: make multiplayer visibly understandable inside the Mamute.

After the transport reaches the real game path:
- verify each remote player has one low-poly crew body, no duplicates/ghosts;
- preserve PS1 industrial silhouette/readability and avoid detailed modern avatars;
- remote crew must respect cabin sections and not visibly clip through machinery where avoidable;
- consume shared hull-hit events for transmitted shake/rattle/light/dust feedback inside;
- finish loader arm presentation so shell ownership reads as rack -> clamp -> arm -> breech, never floating magic;
- keep extinguisher spray/foam visible and repair progress mechanically readable;
- do not retune subjective lighting/audio without real screenshot/device evidence.

### WORLD WAR — map, factions, Mamutes and persistent theatre

Owner goal: make multiplayer crews exist inside ONE shared war, not isolated rooms/worlds.

Do not wait for cosmetic polish once the multiplayer transport contract is stable.

Priority order:
1. preserve the mandatory entry choice `ALIADOS` blue / `EIXO` green;
2. both factions see/use the same canonical theatre state;
3. strategic map uses large hex regions with internal capturable sectors;
4. initialize a coherent roughly divided front, not random enemy pockets behind lines;
5. sector captures bend the continuous front and roll up region ownership only when internal sectors resolve;
6. represent multiple Mamutes as theatre entities/crew destinations, each with faction, vehicle/session id, position/sector and crew occupancy;
7. new players choose faction -> choose/create/join an eligible Mamute on that faction -> enter its crew flow;
8. do not let one crew host own/reset the global war;
9. keep enemy intel partial/stale/unknown according to radio/recon, not omniscient map tracking;
10. preserve physical logistics, finite Mamute ammunition and range limits.

Important: “new Mamutes” means additional independent vehicles in the SAME war. Do not clone the whole war per Mamute and do not permit cross-faction crew inside one Mamute.

### COMBAT AI — coherent forces around the new map

Owner goal: ensure map expansion does not create nonsensical battles.

- derive regular force placement from coherent faction territory/front sectors;
- never spawn standard frontline forces deep behind enemy lines;
- behind-line enemies require explicit recon/raid/partisan/infiltration behavior;
- both factions use symmetric underlying AI/logistics/construction/reinforcement rules;
- use local supply/route/stock/fortification state rather than hidden faction cheats;
- materialize tactical detail where players/Mamutes are relevant while keeping distant simulation economical.

### ARTILLERY — multiplayer-safe station and map coupling

Owner goal: preserve physical gun operation while multiple players share the vehicle.

- AIM remains physical 3D crank control on touch/mobile;
- mobile keeps only compact `CARGA +/-` and `DISPARAR` on the right; no duplicate bottom azimuth/elevation deck;
- station authority gates aim/load/fire interactions so two peers cannot mutate the same station simultaneously;
- map/notebook/radio targeting data should remain consistent for all crew without granting omniscient enemy positions;
- firing consumes the Mamute's shared finite ammunition stock exactly once;
- shared reload/fire state must replicate to all crew without duplicate shot/reload events.

## LEAD integration priorities

LEAD should route work in this order after Codex returns:

P0 — real 2-device crew checkpoint.
P0 — exclusive station ownership + clean disconnect/reconnect.
P0 — faction lock and max-3 enforcement in the real entry flow.
P1 — shared event replication (shot/reload/hull hit/maintenance) and visible remote crew.
P1 — strategic world map: large hex regions + internal sectors + coherent front.
P1 — multiple Mamutes as independent faction-bound vehicles in the same theatre.
P1 — new-player flow: faction -> eligible Mamute/session -> station.
P2 — logistics/territorial development integration around multiple crews/vehicles.
P2 — visual/audio polish after screenshots/device QA.

## Definition of the next meaningful player-visible checkpoint

A user on PC creates an ALIADOS Mamute. A second player on another PC or phone joins that same vehicle, sees the host inside the cabin, takes a different station, and both can operate simultaneously. A third player may join; a fourth cannot. An EIXO player cannot join that ALIADOS Mamute but can create/join an EIXO Mamute in the same ongoing theatre. The strategic map shows both factions in one coherent war with multiple Mamutes attached to positions/sectors. Disconnecting one crew member does not stop or reset the war.

## Anti-duplication rule

Until Codex finishes the current P0 request, agents should not create a second real-transport implementation or a competing lobby/network stack. They may continue independent work that strengthens the contracts above, provided it does not occupy or rewrite Codex hotspots unnecessarily.
