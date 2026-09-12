const text = value => typeof value === 'string' ? value.trim() : '';
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

/**
 * Splits the canonical theatre Mamute roster into a tactical bubble around one
 * Mamute and a distant set that should remain strategic-only.
 *
 * This helper is simulation-side. Do not feed its canonical enemy coordinates
 * directly to player-facing UI; map disclosure must continue through intel.
 */
export function planMamuteMaterialization(roster, focusId, radius = 3200) {
  const wantedId = text(focusId);
  const materializationRadius = finite(radius);
  if (!wantedId || materializationRadius === null || materializationRadius <= 0) return null;

  const records = Array.isArray(roster) ? roster : [];
  const focus = records.find(record => text(record?.id) === wantedId);
  const focusX = finite(focus?.x);
  const focusY = finite(focus?.y);
  if (!focus || focusX === null || focusY === null) return null;

  const radiusSq = materializationRadius * materializationRadius;
  const nearby = [];
  const distant = [];

  for (const record of records) {
    if (!record || record === focus || text(record.id) === wantedId) continue;
    const x = finite(record.x);
    const y = finite(record.y);
    if (x === null || y === null) continue;
    const dx = x - focusX;
    const dy = y - focusY;
    (dx * dx + dy * dy <= radiusSq ? nearby : distant).push(record);
  }

  return Object.freeze({
    focus,
    radius: materializationRadius,
    nearby: Object.freeze(nearby),
    distant: Object.freeze(distant),
  });
}
