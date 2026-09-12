const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));

/**
 * Summarise captured-sector pressure by horizontal bands without inventing a
 * second territory model. The renderer can use these samples to bend the
 * canonical theatre front toward sectors actually held by each faction.
 */
export function strategicFrontPressure({ sectors = [], width = 0, height = 0, bands = 12 } = {}) {
  if (!Array.isArray(sectors) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return Object.freeze([]);
  const count = Math.max(2, Math.min(48, Math.round(Number.isFinite(bands) ? bands : 12)));
  const bandHeight = height / count;
  const out = [];
  for (let index = 0; index < count; index++) {
    const y0 = index * bandHeight, y1 = (index + 1) * bandHeight;
    const local = sectors.filter(sector => Number.isFinite(sector?.x) && Number.isFinite(sector?.y) && sector.y >= y0 && (index === count - 1 ? sector.y <= y1 : sector.y < y1));
    const allies = local.filter(sector => sector.owner === 'ally').map(sector => sector.x);
    const enemies = local.filter(sector => sector.owner === 'enemy').map(sector => sector.x);
    const allyEdge = allies.length ? Math.max(...allies) : null;
    const enemyEdge = enemies.length ? Math.min(...enemies) : null;
    const supported = allyEdge !== null && enemyEdge !== null && allyEdge <= enemyEdge;
    out.push(Object.freeze({
      y: clamp((y0 + y1) * .5, 0, height),
      x: supported ? clamp((allyEdge + enemyEdge) * .5, 0, width) : width * .5,
      allyEdge,
      enemyEdge,
      supported,
    }));
  }
  return Object.freeze(out);
}
