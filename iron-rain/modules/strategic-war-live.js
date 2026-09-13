import './integration-live.js';
import { installMobileUXReview } from './mobile-ux-review.js';
import { createTheatreMamuteSnapshotCycle } from './theatre-mamute-snapshot.js';
import { installStrategicWarLive as installCanonicalStrategicWarLive } from './strategic-war-live-v3.js';

/**
 * Canonical strategic-map facade.
 *
 * MAP_REWORK_20260912.md makes strategic-war-live-v3.js the only live renderer.
 * Keep cross-cutting integration/mobile review here, but never layer a second
 * strategic renderer, marker system, coordinate transform or map simulation on
 * top of v3. v3 already owns the Mamute marker, region/sector location, notebook
 * bridge, uniform map scale and strategic theatre presentation.
 */
export function installStrategicWarLive(options = {}) {
  const base = installCanonicalStrategicWarLive(options);
  if (!base) return base;

  // v3 owns the canonical theatre/logistics instance. Preserve its read-only
  // reserve bridge before this façade replaces the global map surface.
  const combatReserveContext = globalThis.ironRainStrategicMap?.combatReserveContext;
  const mamuteSnapshots = createTheatreMamuteSnapshotCycle();
  const mobileUx = installMobileUXReview(document);
  globalThis.ironRainStrategicMap = Object.freeze({
    locate: point => base.locate?.(point) || null,
    combatReserveContext: (sectorId, team) => combatReserveContext?.(sectorId, team) || null,
    mamuteSnapshot: options => mamuteSnapshots.build(options),
    open: () => base.open?.(),
    close: () => base.close?.(),
    mobileUx,
  });

  return Object.freeze({
    ...base,
    mobileUx,
    destroy() {
      mamuteSnapshots.reset();
      base.destroy?.();
      if (globalThis.ironRainStrategicMap?.mobileUx === mobileUx) delete globalThis.ironRainStrategicMap;
    },
  });
}
