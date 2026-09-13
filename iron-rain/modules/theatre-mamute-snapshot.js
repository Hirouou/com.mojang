import { buildTheatreMamuteMapContacts } from './theatre-mamute-map.js';
import { planMamuteMaterialization } from './theatre-mamute-materialization.js';

/**
 * Composes the canonical Mamute roster into one WORLD WAR snapshot without
 * mixing simulation authority with player-facing intel.
 *
 * `materialization` keeps canonical positions for simulation/render spawning.
 * `mapContacts` is independently fog-gated and must be the only list handed to
 * player-facing strategic map UI. `previousNearbyIds` carries only simulation-
 * side materialization state between snapshots so the planner can apply its
 * retention hysteresis without making enemy coordinates visible to the map.
 */
export function buildTheatreMamuteSnapshot({
  roster,
  focusId,
  viewerFaction,
  intelEntries = [],
  radius = 3200,
  maxNearby,
  previousNearbyIds = [],
} = {}) {
  const materialization = planMamuteMaterialization(
    roster,
    focusId,
    radius,
    {
      ...(maxNearby === undefined ? {} : { maxNearby }),
      previousNearbyIds,
    },
  );
  if (!materialization) return null;

  const mapContacts = buildTheatreMamuteMapContacts(roster, viewerFaction, intelEntries);
  const tacticalIds = new Set(materialization.nearby.map(record => record?.id).filter(Boolean));
  tacticalIds.add(materialization.focus.id);

  return Object.freeze({
    focus: materialization.focus,
    radius: materialization.radius,
    retentionRadius: materialization.retentionRadius,
    maxNearby: materialization.maxNearby,
    nearby: materialization.nearby,
    distant: materialization.distant,
    tacticalIds: Object.freeze([...tacticalIds]),
    mapContacts,
  });
}

/**
 * Stateful live-orchestration seam for repeated theatre snapshots.
 * Retention history is simulation-side only and resets whenever focus changes.
 */
export function createTheatreMamuteSnapshotCycle() {
  let focusId = null;
  let previousNearbyIds = Object.freeze([]);

  function reset() {
    focusId = null;
    previousNearbyIds = Object.freeze([]);
  }

  function build(options = {}) {
    const requestedFocusId = typeof options.focusId === 'string' ? options.focusId.trim() : '';
    const history = requestedFocusId && requestedFocusId === focusId ? previousNearbyIds : [];
    const snapshot = buildTheatreMamuteSnapshot({ ...options, previousNearbyIds: history });
    if (!snapshot) {
      reset();
      return null;
    }

    focusId = snapshot.focus.id;
    previousNearbyIds = Object.freeze(snapshot.nearby.map(record => record?.id).filter(Boolean));
    return snapshot;
  }

  return Object.freeze({ build, reset });
}
