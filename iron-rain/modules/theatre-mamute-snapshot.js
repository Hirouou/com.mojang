import { buildTheatreMamuteMapContacts } from './theatre-mamute-map.js';
import { planMamuteMaterialization } from './theatre-mamute-materialization.js';

/**
 * Composes the canonical Mamute roster into one WORLD WAR snapshot without
 * mixing simulation authority with player-facing intel.
 *
 * `materialization` keeps canonical positions for simulation/render spawning.
 * `mapContacts` is independently fog-gated and must be the only list handed to
 * player-facing strategic map UI.
 */
export function buildTheatreMamuteSnapshot({
  roster,
  focusId,
  viewerFaction,
  intelEntries = [],
  radius = 3200,
  maxNearby,
} = {}) {
  const materialization = planMamuteMaterialization(
    roster,
    focusId,
    radius,
    maxNearby === undefined ? undefined : { maxNearby },
  );
  if (!materialization) return null;

  const mapContacts = buildTheatreMamuteMapContacts(roster, viewerFaction, intelEntries);
  const tacticalIds = new Set(materialization.nearby.map(record => record?.id).filter(Boolean));
  tacticalIds.add(materialization.focus.id);

  return Object.freeze({
    focus: materialization.focus,
    radius: materialization.radius,
    maxNearby: materialization.maxNearby,
    nearby: materialization.nearby,
    distant: materialization.distant,
    tacticalIds: Object.freeze([...tacticalIds]),
    mapContacts,
  });
}
