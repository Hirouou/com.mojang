import './integration-live.js';
import { installMobileUXReview } from './mobile-ux-review.js';
import { createMamuteTacticalLifecycle } from './theatre-mamute-lifecycle.js';
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

  // v3 owns the canonical theatre/logistics instance. Preserve its strategic
  // seams before this façade replaces the global map surface.
  const combatReserveContext = globalThis.ironRainStrategicMap?.combatReserveContext;
  const claimAsset = globalThis.ironRainStrategicMap?.claimAsset;
  const assetCount = globalThis.ironRainStrategicMap?.assetCount;
  const applySectorControl = globalThis.ironRainStrategicMap?.applySectorControl;
  const mamuteSnapshots = createTheatreMamuteSnapshotCycle();
  const mamuteLifecycle = options.mamuteLifecycle || createMamuteTacticalLifecycle(options.mamuteTactical || {});
  const mobileUx = installMobileUXReview(document);
  globalThis.ironRainStrategicMap = Object.freeze({
    locate: point => base.locate?.(point) || null,
    combatReserveContext: (sectorId, team) => combatReserveContext?.(sectorId, team) || null,
    claimAsset: (sectorId, team, type, count = 1) => claimAsset?.(sectorId, team, type, count) || false,
    assetCount: (sectorId, team, type) => assetCount?.(sectorId, team, type) || 0,
    applySectorControl: update => applySectorControl?.(update) || Object.freeze({ ok: false, changed: false, reason: 'strategic-map-unavailable' }),
    mamuteSnapshot: snapshotOptions => {
      const snapshot = mamuteSnapshots.build(snapshotOptions);
      mamuteLifecycle.apply?.(snapshot);
      return snapshot;
    },
    open: () => base.open?.(),
    close: () => base.close?.(),
    mobileUx,
  });

  return Object.freeze({
    ...base,
    mobileUx,
    destroy() {
      mamuteLifecycle.reset?.();
      mamuteSnapshots.reset();
      base.destroy?.();
      if (globalThis.ironRainStrategicMap?.mobileUx === mobileUx) delete globalThis.ironRainStrategicMap;
    },
  });
}