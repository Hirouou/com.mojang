export const THEATRE_SIZE = Object.freeze({ w: 80_000, h: 60_000 });

/**
 * One continuous north/south front. Allied territory is west/left of the line;
 * enemy territory is east/right. The line can later be persisted/moved by the
 * strategic simulation without scattering independent fronts behind each other.
 */
export const DEFAULT_CONTROL_LINE = Object.freeze([
  Object.freeze({ y: 0, x: 17_400 }),
  Object.freeze({ y: 8_000, x: 18_600 }),
  Object.freeze({ y: 16_000, x: 17_100 }),
  Object.freeze({ y: 24_000, x: 19_100 }),
  Object.freeze({ y: 32_000, x: 18_000 }),
  Object.freeze({ y: 40_000, x: 20_200 }),
  Object.freeze({ y: 48_000, x: 18_900 }),
  Object.freeze({ y: 60_000, x: 20_000 }),
]);

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));

export function controlLineX(y, points = DEFAULT_CONTROL_LINE) {
  const list = Array.isArray(points) && points.length >= 2 ? points : DEFAULT_CONTROL_LINE;
  const py = clamp(y, list[0].y, list.at(-1).y);
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (py < a.y || py > b.y) continue;
    const span = Math.max(1, b.y - a.y), t = (py - a.y) / span;
    return a.x + (b.x - a.x) * t;
  }
  return list.at(-1).x;
}

export function territoryAt({ x, y } = {}, { points = DEFAULT_CONTROL_LINE, contestedWidth = 900 } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const lineX = controlLineX(y, points), half = Math.max(0, Number(contestedWidth) || 0) / 2;
  if (x < lineX - half) return 'ally';
  if (x > lineX + half) return 'enemy';
  return 'contested';
}

/**
 * Stable anchors used for tactical fronts. Every front lies on the SAME control
 * line, ordered north-to-south, so there is no ally front accidentally behind
 * an enemy front on the same axis.
 */
export function createFrontAnchors({ count = 7, points = DEFAULT_CONTROL_LINE, margin = 5_000 } = {}) {
  const total = Math.max(1, Math.min(16, Math.floor(Number(count) || 7)));
  const h = THEATRE_SIZE.h;
  const start = clamp(margin, 0, h / 3), end = h - start;
  return Object.freeze(Array.from({ length: total }, (_, index) => {
    const y = total === 1 ? h / 2 : start + (end - start) * index / (total - 1);
    return Object.freeze({ index, x: controlLineX(y, points), y });
  }));
}

export function lineSnapshot(points = DEFAULT_CONTROL_LINE) {
  return Object.freeze(points.map(point => Object.freeze({ x: point.x, y: point.y })));
}

/** Move one section of the strategic line after territory is genuinely gained. */
export function shiftControlLine(points, centerY, metres, radius = 9_000) {
  const source = Array.isArray(points) && points.length >= 2 ? points : DEFAULT_CONTROL_LINE;
  const amount = Number.isFinite(metres) ? metres : 0, spread = Math.max(1, Number(radius) || 1);
  return Object.freeze(source.map(point => {
    const distance = Math.abs(point.y - centerY);
    const weight = distance >= spread ? 0 : .5 + .5 * Math.cos(Math.PI * distance / spread);
    return Object.freeze({ x: clamp(point.x + amount * weight, 2_000, THEATRE_SIZE.w - 2_000), y: point.y });
  }));
}
