# Iron Rain QA — PWA transitive cache regression

Date: 2026-09-13 02:22 BRT
Branch: `iron-rain-v6-1-continuation`
Role: QA / governance

## Finding

The live strategic facade loads `strategic-war-live-v3.js`, and that renderer imports runtime dependencies such as `strategic-front-pressure.js` and `strategic-capture-state.js`. The facade itself also imports the Mamute snapshot/lifecycle modules. Those transitive runtime modules were not all present in `sw.js` `OFFLINE_FILES`.

Because the service worker ignores same-scope assets that are not in `knownAssets`, an installed PWA could work online yet fail to resolve one of those module imports when opened offline after an update. This was treated as a critical PWA usability regression with no gameplay feature change.

## Minimal correction

- Bumped the Iron Rain service-worker cache generation.
- Added the current transitive runtime modules used by the live strategic/Mamute/intel/combat/artillery paths to the offline installation list.
- Added `tests/pwa-transitive-offline.test.js`, which walks cached JavaScript assets and requires their relative static/dynamic imports to also be cached. This closes the coverage gap in the older PWA test, which only checked direct imports from `game-v6.js`.

## Validation

Official `Publish Iron Rain` workflow for the regression-test commit completed successfully. Its `Test Iron Rain` and `Deploy Pages` steps both completed with success. Stable URL remains `https://hirouou.github.io/com.mojang/`.

## Other QA checks in this run

- Mobile AIM CSS still removes duplicate 2D handwheels/ammo/loading controls and leaves charge controls plus fire on the right; the physical 3D machinery remains the intended aiming surface.
- `crew-session.js` still enforces capacity 3, faction match for a Mamute, and station claims through authority state.
- `crew-broadcast-transport.js` still labels BroadcastChannel explicitly as same-origin QA transport, not final internet/public multiplayer.
- Strategic facade still points to v3; world-map intel still masks remote hostile/contested ownership unless local/radio/report intel exists.
- Real PC→PC / PC→iPhone multiplayer and Safari audio remain device/end-to-end validation blockers; server-authoritative public multiplayer work remains in progress.

## Coordination note

`docs/AGENT_LOG.md` was read as required. It is currently a very large, actively shared coordination hotspot, while the available repository write primitive replaces the whole file rather than appending. This run did not risk truncating or overwriting concurrent agent history; this dedicated QA record preserves the finding and validation until a safe append path is available.
