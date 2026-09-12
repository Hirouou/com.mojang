const text = value => typeof value === 'string' ? value.trim() : '';
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

export const DEFAULT_MAMUTE_TACTICAL_BUDGET = 6;
export const DEFAULT_MAMUTE_RETENTION_MULTIPLIER = 1.15;

/**
 * Splits the canonical theatre Mamute roster into a bounded tactical bubble
 * around one Mamute and a distant set that should remain strategic-only.
 *
 * The radius decides admission; maxNearby decides how many eligible Mamutes
 * may materialize at once. Previously materialized contacts may be retained a
 * little beyond the admission radius so small position oscillations do not
 * repeatedly destroy/recreate tactical entities at the bubble edge. Retained
 * contacts still obey the same hard budget and deterministic ordering.
 *
 * Overflow stays in the strategic simulation instead of creating an unbounded
 * local render/AI cost on dense fronts. New contacts are ranked by nearest
 * distance, with id as the stable tie-breaker.
 *
 * This helper is simulation-side. Do not feed its canonical enemy coordinates
 * directly to player-facing UI; map disclosure must continue through intel.
 */
export function planMamuteMaterialization(roster, focusId, radius = 3200, {
  maxNearby = DEFAULT_MAMUTE_TACTICAL_BUDGET,
  previousNearbyIds = [],
  retentionMultiplier = DEFAULT_MAMUTE_RETENTION_MULTIPLIER,
} = {}) {
  const wantedId = text(focusId);
  const materializationRadius = finite(radius);
  const budgetRaw = finite(maxNearby);
  const tacticalBudget = budgetRaw === null ? null : Math.floor(budgetRaw);
  const retentionRaw = finite(retentionMultiplier);
  if (!wantedId || materializationRadius === null || materializationRadius <= 0) return null;
  if (tacticalBudget === null || tacticalBudget < 0) return null;
  if (retentionRaw === null || retentionRaw < 1) return null;

  const retainedIds = new Set((Array.isArray(previousNearbyIds) ? previousNearbyIds : []).map(text).filter(Boolean));
  retainedIds.delete(wantedId);

  const records = Array.isArray(roster) ? roster : [];
  const focus = records.find(record => text(record?.id) === wantedId);
  const focusX = finite(focus?.x);
  const focusY = finite(focus?.y);
  if (!focus || focusX === null || focusY === null) return null;

  const radiusSq = materializationRadius * materializationRadius;
  const retentionRadius = materializationRadius * retentionRaw;
  const retentionRadiusSq = retentionRadius * retentionRadius;
  const eligible = [];
  const distant = [];

  for (const record of records) {
    if (!record || record === focus || text(record.id) === wantedId) continue;
    const id = text(record.id);
    const x = finite(record.x);
    const y = finite(record.y);
    if (x === null || y === null) continue;
    const dx = x - focusX;
    const dy = y - focusY;
    const distanceSq = dx * dx + dy * dy;
    const retained = retainedIds.has(id) && distanceSq <= retentionRadiusSq;
    if (distanceSq <= radiusSq || retained) eligible.push({ record, distanceSq, retained });
    else distant.push(record);
  }

  eligible.sort((a, b) => Number(b.retained) - Number(a.retained) || a.distanceSq - b.distanceSq || text(a.record.id).localeCompare(text(b.record.id)));
  const nearby = eligible.slice(0, tacticalBudget).map(entry => entry.record);
  distant.push(...eligible.slice(tacticalBudget).map(entry => entry.record));

  return Object.freeze({
    focus,
    radius: materializationRadius,
    retentionRadius,
    maxNearby: tacticalBudget,
    nearby: Object.freeze(nearby),
    distant: Object.freeze(distant),
  });
}
