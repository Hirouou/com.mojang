import { DEFAULT_CONTROL_LINE, THEATRE_SIZE, territoryAt } from './theatre-control.js';

const freezePoint = point => Object.freeze({ x: point.x, y: point.y });

/** A large region is fully owned only when every internal sector agrees. */
export function regionControlFromSectors(sectors) {
  const controls = (Array.isArray(sectors) ? sectors : []).map(sector => sector?.control).filter(Boolean);
  if (!controls.length) return 'contested';
  if (controls.every(control => control === 'ally')) return 'ally';
  if (controls.every(control => control === 'enemy')) return 'enemy';
  return 'contested';
}

/** Seven capturable samples: one centre sector plus a six-sector ring. */
export function createHexRegionSectors({ id, x, y, radius, points = DEFAULT_CONTROL_LINE, contestedWidth = 900 } = {}) {
  const safeRadius = Math.max(500, Number(radius) || 6_000);
  const ringRadius = safeRadius * .52;
  const offsets = [{ x: 0, y: 0 }, ...Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 3 * index;
    return { x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius };
  })];
  return Object.freeze(offsets.map((offset, index) => {
    const position = freezePoint({ x: x + offset.x, y: y + offset.y });
    return Object.freeze({
      id: `${id}-s${index + 1}`,
      index,
      x: position.x,
      y: position.y,
      control: territoryAt(position, { points, contestedWidth }) || 'contested',
    });
  }));
}

/**
 * Strategic-region foundation for the giant map. Ownership is derived from the
 * existing continuous control line, never from a second/scattered front model.
 */
export function createTheatreHexRegions({ columns = 6, rows = 5, radius = 6_000, points = DEFAULT_CONTROL_LINE, contestedWidth = 900 } = {}) {
  const cols = Math.max(1, Math.min(12, Math.floor(Number(columns) || 6)));
  const rowCount = Math.max(1, Math.min(10, Math.floor(Number(rows) || 5)));
  const safeRadius = Math.max(500, Number(radius) || 6_000);
  const xStep = safeRadius * 1.5;
  const yStep = safeRadius * Math.sqrt(3);
  const width = (cols - 1) * xStep + safeRadius * 2;
  const height = (rowCount - 1) * yStep + safeRadius * Math.sqrt(3) + yStep / 2;
  const originX = Math.max(safeRadius, (THEATRE_SIZE.w - width) / 2 + safeRadius);
  const originY = Math.max(safeRadius, (THEATRE_SIZE.h - height) / 2 + safeRadius);
  const regions = [];

  for (let column = 0; column < cols; column++) {
    for (let row = 0; row < rowCount; row++) {
      const x = originX + column * xStep;
      const y = originY + row * yStep + (column % 2 ? yStep / 2 : 0);
      if (x + safeRadius > THEATRE_SIZE.w || y + safeRadius > THEATRE_SIZE.h) continue;
      const id = `hex-${column}-${row}`;
      const sectors = createHexRegionSectors({ id, x, y, radius: safeRadius, points, contestedWidth });
      regions.push(Object.freeze({ id, column, row, x, y, radius: safeRadius, control: regionControlFromSectors(sectors), sectors }));
    }
  }
  return Object.freeze(regions);
}
