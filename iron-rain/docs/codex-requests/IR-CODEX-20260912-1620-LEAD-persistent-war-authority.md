# IR-CODEX-20260912-1620-LEAD-persistent-war-authority

STATUS: IN_PROGRESS
CLAIMED_HEAD: 3c7e547fa678b4bc56d2c85cbf3a392c211ec12a
CLAIMED_AT: 2026-09-12T22:46:35-03:00
REQUESTER: LEAD
RETURN_TO: LEAD
PRIORITY: P0
TYPE: INVESTIGATION
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: 51422fac0f474512cc87a8c35cce85dbf33435c2

## OWNER CORRECTION — 2026-09-12 21:32 BRT
This request is no longer a distant P1 architecture exercise. The owner explicitly requires the next real multiplayer direction to be a SERVER-AUTHORITATIVE persistent war: no player-host owns the theatre, the war continues with no crew online, ALIADOS/EIXO coexist in the same theatre, and opposing Mamutes must be able to fight with one authoritative result.

After/alongside the active transport P0, this request is now the backend/authority half of the same P0 product checkpoint. Do not recommend player-host migration as world authority.

## MISSÃO
CODEX claim: backend/authority half of the active P0 transport. Preparing a dedicated authoritative process and durable state, then wiring the existing client; no player/browser becomes authority. Public backend endpoint/hosting has not yet been found in the repository/environment. Preserve CODEX ownership of server, bootstrap, runtime and main gameplay integration.

Definir e, se the environment permits, prepare the smallest viable backend/authority so the shared Iron Rain war continues advancing independently of any browser, phone or Mamute crew.

The immediate player-test target is concrete: player A joins an ALIADOS Mamute, player B joins an EIXO Mamute, both in the same persistent theatre. A fires at B. The server/world authority validates command/station/ammo, resolves the shot and damage once, updates both Mamutes/theatre, and replicates the same result to both clients. If both players disconnect, the war snapshot remains and can advance/catch up safely.

## VISÃO ATUALIZADA DO USUÁRIO
- One persistent theatre shared by ALIADOS and EIXO.
- Multiple faction-bound Mamutes coexist in that theatre; a Mamute is not a new war instance.
- Up to 3 crew per Mamute, exclusive physical stations; crew membership is ephemeral, Mamute/world state is persistent.
- Large hex regions contain internal sectors; a region is fully controlled only when all internal sectors resolve to the same faction.
- Coherent front, neutral/disputed corridor, no regular force magically spawning behind enemy lines; deep activity only by explicit raid/recon/partisan/infiltration.
- Both factions use the same AI, construction, logistics, ammunition, range and scarcity rules.
- World map intel is partial and radio/recon/report gated.
- Mamute ammunition is finite and physical logistics matter.

## CONTEXTO JÁ IMPLEMENTADO
- `modules/theatre-control.js`: linha territorial contínua.
- `modules/theatre-sectors.js`: fronts táticos coerentes.
- `modules/strategic-hex-map.js`: large-hex/internal-sector model.
- `modules/world-map-intel.js`: visibility based on radio/reports.
- `modules/local-missions.js`: proximity/radio mission rules.
- `modules/territory-development.js`: safe territory + delivered materials -> construction.
- `modules/territory-ai.js`: symmetric planner.
- `modules/strategic-logistics.js`: routes/nodes/convoys with real cargo loss/blocking.
- `modules/mamute-logistics.js`: finite onboard ammo and stocked friendly refill points.
- `modules/persistent-war-clock.js`: catch-up primitive only, not persistence.
- `modules/crew-session.js`: current crew coordination; any host semantics are temporary/crew-local and must not own the world.
- `modules/crew-station-authority.js`: exclusive station ownership.
- `modules/mamute-command-authority.js`: validates drive/aim/fire/load/service against station ownership.

## FAZER
- Consume the current result/state of `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md`; coordinate, do not duplicate its transport stack.
- Recommend/prepare the smallest server/backend authority compatible with static GitHub Pages clients and iPhone/Safari.
- Separate three layers explicitly: client presentation/input; Mamute crew/station coordination; persistent world/Mamute authority.
- Define canonical persistent ids for theatre, Mamute, faction, player/crew presence and stations.
- Define authoritative command flow for `drive`, `aim`, `load`, `fire`, `service`, join/leave and strategic deployment.
- Fire must validate station ownership + ammo + weapon state, consume ammo exactly once, produce one projectile/impact outcome, update target Mamute once, then replicate event/snapshot.
- Define snapshot + event log/storage sufficient for reconnect without `performance.now()` dependency.
- Define authoritative clock/catch-up with bounded steps.
- Persist: theatre clock, hexes/sectors/front line, structures/bases, local stocks, logistics/routes/convoys, AI/forces, radio/intel, Mamutes and finite ammo/health/deployment state.
- Preserve faction symmetry and scarcity.
- Preserve fog/intel: backend may know authoritative state, player payloads must be filtered by valid intel.
- If implementation is feasible now, create isolated backend adapters/contracts without putting sockets/networking in `cabin-view.js` or `cabin-controls.js`.
- If external service is necessary, give one concrete minimal recommendation with cost/free tier, persistence guarantees, WebSocket/realtime support, auth/security considerations and GitHub Pages compatibility.

## NÃO FAZER
- do not edit `iron-rain-frontline`;
- do not make any player/browser the world server;
- do not create separate theatre per Mamute or faction;
- do not call `persistent-war-clock.js` persistence;
- do not place networking in renderer/camera/input modules;
- do not create magical ammo/material replication;
- do not expose omniscient enemy state to clients;
- do not give asymmetric hidden cheats to one faction;
- do not rewrite the whole simulation just to prove backend connectivity.

## CRITÉRIOS DE ACEITE
- Explicit server/world authority exists conceptually and, when feasible, as an adapter/API boundary.
- No player disconnect is capable of stopping/resetting the war.
- Multiple ALIADOS/EIXO Mamutes coexist under one theatre id.
- Reconnect reconstructs a consistent theatre + Mamute snapshot.
- Commands are idempotent/deduplicated enough to avoid double fire/double ammo/double damage.
- Opposing-Mamute test path is specified or executable: A fires -> authority validates/resolves -> both receive same outcome.
- Theatre advances/catches up from authoritative wall time with bounded simulation.
- Backend storage supports the required world state without making the client a secret holder.
- Intel filtering keeps player-facing information non-omniscient.
- There is an incremental migration path from existing modules rather than a giant rewrite.

## EVIDÊNCIA ESPERADA
- textual architecture and concrete service/backend choice;
- message/API contracts for join theatre, list/create/join Mamute, station claims, commands, snapshots and events;
- storage schema or equivalent object model;
- one cross-faction fire transaction example with dedupe/idempotency semantics;
- risks/costs/limits for iPhone + GitHub Pages;
- exact next implementation steps and files/adapters;
- explicit statement that player-host authority is rejected for the world.
