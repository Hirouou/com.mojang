# IRON RAIN — ACTIVE USER DIRECTIVES — 2026-09-12

This file is a cross-agent directive from the project owner. All active agents, automations and Codex work should read it before choosing the next task. It does not replace `IRON_RAIN_VISION.md`, `MULTI_AGENT_CONTROL.md` or the LEAD sprint; it sharpens current priorities.

## P0 — multiplayer / entry flow

- Multiplayer is the current top priority until a real two-device checkpoint exists.
- Maximum 3 players per Mamute: one local player plus at most two remote crew.
- The first player-facing entry flow must ask which side to join before the Mamute/session flow:
  - `ALIADOS` = blue side.
  - `EIXO` = green side.
- Both sides participate in the SAME persistent war. Do not fork separate local wars per faction.
- A Mamute belongs to one faction; opposite-faction players cannot join the same vehicle/session.
- Create/join/play-alone/enter-Mamute must remain understandable to a normal player; never expose technical signaling.
- Two players must not control the same physical station at the same time. Station ownership is exclusive and must release on leave/disconnect.
- Driver/gunner/loader can operate different stations simultaneously and share the same Mamute state.
- The war must continue independently of one crew member leaving. Long-term authority must not live only inside the crew host.

## Mobile first-person interaction — current owner feedback

The physical 3D controls are now the preferred interaction surface on mobile. The old duplicate bottom UI must not cover the actual machinery.

For the AIM station on touch/mobile:
- hide the duplicated UI handwheels for azimuth/elevation;
- the player should touch/drag the actual 3D handwheel/crank in the Mamute;
- preserve a compact `CARGA` +/- control at the right edge because charge is still an abstract setting for now;
- put `DISPARAR` directly under the compact charge control;
- keep the centre/lower scene clear so the physical azimuth/elevation controls stay visible and touchable;
- do not regress desktop/mouse controls;
- keep `AFASTAR-SE` available without rebuilding a large bottom panel.

General direction: less abstract UI, more physical machine operation. `mobile-station-ui.css` is the current implementation path; integrate/preserve it rather than creating a competing mobile fire deck.

## Shared feedback / immersion

- External hits on the Mamute must produce interior feedback for every crew member: transmitted hull impact, metal rattle/creak, shake/light/dust according to hit strength.
- Reload must stop looking magical. Use the mechanical robotic loader arm: rotate -> acquire selected shell -> clamp -> rotate to breech -> insert -> lock/ready.
- Extinguisher must visibly spray/foam while active.
- Repair must show visible progress and mechanical/audio response.
- Continue removing floating/misaligned props and adding meaningful mechanical animation.
- iPhone/Safari audio silence remains a real bug until verified fixed on-device.

## Strategic map — large hex regions with internal sectors

- Expand the strategic world map into large hexagonal regions, inspired by the territorial flow of large persistent-war maps but using Iron Rain's own systems/art.
- Each large hex contains multiple smaller capturable sectors/areas.
- A hex only counts as fully controlled when all of its internal sectors are controlled by that faction.
- The war should begin approximately divided between the two factions with a coherent territorial boundary/front.
- Regular allied/enemy forces must not spawn or form contradictory fronts deep behind the opposing line.
- Behind-the-lines hostile activity is allowed only when it is an explicit partisan/recon/raid/infiltration behavior, not ordinary frontline placement.
- Captures move/bend the coherent ownership boundary and change which internal sectors/hexes belong to each faction; do not create disconnected arbitrary fronts.
- The world map is a strategic planning surface where the player can inspect available fronts and choose where to support.

## Physical capitals inside each large hex — owner update 2026-09-13

- Every colored point shown inside a large hex represents a **physical capital / sector nucleus**, not an abstract marker.
- Each capital must exist in the local/materialized world with buildings, streets/roads, defenses, faction NPCs/AI and logistics appropriate to that sector's real development, stock and safety state.
- Capitals inside a large hex should be connected by a legible road/logistics network, plus external routes into neighboring territory where geography allows.
- Capturing a capital is NOT a circle/timer flip. Required loop: attack -> neutralize/destroy defending capital/structures -> capital becomes destroyed/neutralized -> attacker physically delivers resources/materials -> attacker rebuilds/reactivates the capital -> only then does it become a functional capital of the new faction.
- If the attacker has not delivered enough materials, the capital remains destroyed/contested/neutral and does not become magically owned.
- A large hex is fully controlled only when all internal capitals/sectors have been captured and reactivated by the same faction.
- The strategic map must show capital state clearly: active, under attack, destroyed, rebuilding, isolated, no-supply, plus valid ownership/intel.
- The world around the player cannot be empty near a capital: there must be visible structures, roads, AI activity, defenses and war-state feedback when that capital is materialized.
- Do not materialize the entire world at full fidelity at once. Remote capitals continue in the canonical strategic simulation and materialize locally when relevant, reflecting the same authoritative state instead of creating a parallel world.
- Full implementation details and workstream gates are in `CAPITAL_CAPTURE_DIRECTIVE_20260913.md`; all map/AI/logistics/materialization work must consume that file in the same cycle.

## Faction symmetry — same war rules for both sides

- Allied and enemy NPCs use the same underlying AI, construction, logistics, ammunition, range, fortification, reinforcement, vehicle and territorial-development rules.
- Do not give one faction hidden free reinforcements, magical construction or faction-specific economic cheats.
- Differences between sides should emerge from territory, stock, route safety, casualties, preparation, structures and AI decisions.
- The same development tiers and costs apply to both sides unless a future explicit faction-design decision changes it.

## Persistent war / territory / logistics

- Strategic ownership must form a coherent continuous front. Do not place allied fronts behind an enemy front on the same axis.
- Territory held safely for time can develop, but construction requires physical logistics.
- Secure territory -> supply route -> truck delivery -> stored materials -> construction.
- Cut/unsafe route means no delivery and no construction progress.
- Development can progress through field defenses/outpost -> depot/mortar/bunker -> garage/heavier support -> factory after long secure control.
- Factories produce materials; materials still need transport to other positions. No magical remote upgrades.
- AI should use actual local supply, defenses, reinforcement availability and preparation state.
- Supply trucks/convoys physically carry ammunition/materials/fuel between rear production/depot nodes and forward positions. Destroyed/cut convoys do not teleport their cargo to the destination.
- Mamute ammunition is finite. Every shot consumes onboard stock.
- A friendly base with zero shell stock cannot refill the Mamute. The crew must travel to another stocked base or wait for logistics to deliver ammunition there.
- Range remains physical: being ordered to support a sector does not make the artillery able to hit a target outside its actual ballistic range.
- **Owner update 2026-09-13:** all agents touching logistics/AI/world war must also consume `LOGISTICS_ECONOMY_DIRECTIVE_20260913.md`. Resources are scarce; most initial material comes from deep rear territory; trucks, troop transports and tanks are finite physical entities; destroyed tanks must be reproduced only at capitals with the required industrial infrastructure, stock and build time; produced vehicles then travel physically to staging/front. No vehicle/reinforcement spawn magic.

## Radio, world map and missions

- The strategic world map is NOT an omniscient enemy tracker.
- Friendly-controlled territory can be known, but remote front detail should depend on friendly radio coverage, recon and valid reports.
- Enemy information may be exact, uncertain, stale or absent depending on the intelligence source/age.
- The player should be able to consult radio-covered fronts and choose where to deploy/support.
- Ordinary field missions should mostly be generated/delivered when the Mamute is near the relevant sector/front.
- Remote high-command missions can arrive through radio, but should not reveal live enemy state without actual intel.

## Persistent world authority

- The global war state must not be owned by whichever phone/PC happens to host one Mamute crew.
- Crew/session authority and world-war authority are separate responsibilities.
- Leaving a crew must not reset/stop territorial war state.
- `persistent-war-clock.js` is only a wall-clock/catch-up primitive; do not call persistence complete until there is authoritative backend/storage capable of restoring a shared theatre snapshot and advancing it safely.

## Product / deployment rule

- Keep using the SAME stable Pages/PWA URL already installed on the owner's iPhone home screen. Ordinary updates must replace the build behind that address, not create a new user URL.
- Clearly separate foundation from visible/player-testable integration in reports.
