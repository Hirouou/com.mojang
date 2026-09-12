import { THEATRE_SIZE, territoryAt } from './theatre-control.js';

const SQRT3 = Math.sqrt(3);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));

export const STRATEGIC_HEX = Object.freeze({
  radius: 6_200,
  sectorRadius: 2_250,
  sectorNames: Object.freeze(['CENTRO', 'NORTE', 'NORDESTE', 'SUDESTE', 'SUL', 'SUDOESTE', 'NOROESTE']),
});

const axialToWorld = (q, r, radius = STRATEGIC_HEX.radius) => ({
  x: radius * 1.5 * q,
  y: radius * SQRT3 * (r + q / 2),
});

const sectorOffsets = radius => [
  [0, 0],
  [0, -radius],
  [radius * .866, -radius * .5],
  [radius * .866, radius * .5],
  [0, radius],
  [-radius * .866, radius * .5],
  [-radius * .866, -radius * .5],
];

const hexName = index => {
  const first = ['ASH', 'BRASS', 'CINDER', 'DUSK', 'EMBER', 'FROST', 'GARNET', 'HOLLOW', 'IRON', 'JAGGED'];
  const second = ['FIELD', 'PASS', 'VALE', 'RIDGE', 'MARSH', 'REACH', 'WOOD', 'CROSSING'];
  return `${first[index % first.length]} ${second[Math.floor(index / first.length) % second.length]}`;
};

/**
 * Strategic world regions inspired by a hex-map war, while keeping Iron Rain's
 * own theatre scale and rules. Every hex contains seven capturable sectors.
 */
export function createStrategicHexMap({ width = THEATRE_SIZE.w, height = THEATRE_SIZE.h, radius = STRATEGIC_HEX.radius } = {}) {
  const margin = radius * .9;
  const hexes = [];
  let serial = 0;
  for (let q = 0; ; q++) {
    const baseX = margin + axialToWorld(q, 0, radius).x;
    if (baseX > width - margin) break;
    for (let r = -Math.ceil(q / 2) - 1; r < 20; r++) {
      const raw = axialToWorld(q, r, radius);
      const x = margin + raw.x, y = margin + raw.y;
      if (y < margin || y > height - margin) continue;
      const id = `HX-${String(++serial).padStart(2, '0')}`;
      const offsets = sectorOffsets(Math.min(STRATEGIC_HEX.sectorRadius, radius * .42));
      const sectors = offsets.map(([dx, dy], index) => {
        const sx = clamp(x + dx, 0, width), sy = clamp(y + dy, 0, height);
        return {
          id: `${id}-S${index}`,
          name: STRATEGIC_HEX.sectorNames[index],
          x: sx,
          y: sy,
          owner: territoryAt({ x: sx, y: sy }),
          controlProgress: 0,
          radio: false,
          structures: [],
        };
      });
      hexes.push({ id, name: hexName(serial - 1), q, r, x, y, radius, sectors });
    }
  }
  return Object.freeze(hexes.map(hex => freezeHex(hex)));
}

function freezeHex(hex) {
  return Object.freeze({ ...hex, sectors: Object.freeze(hex.sectors.map(sector => Object.freeze({ ...sector, structures: Object.freeze([...(sector.structures || [])]) }))) });
}

export function hexControl(hex) {
  const owners = (hex?.sectors || []).map(sector => sector.owner).filter(owner => owner === 'ally' || owner === 'enemy' || owner === 'contested');
  if (!owners.length) return 'neutral';
  if (owners.every(owner => owner === 'ally')) return 'ally';
  if (owners.every(owner => owner === 'enemy')) return 'enemy';
  return 'contested';
}

/** A region flips only after every internal sector is controlled by that faction. */
export function canCaptureHex(hex, team) {
  if (!['ally', 'enemy'].includes(team) || !Array.isArray(hex?.sectors) || !hex.sectors.length) return false;
  return hex.sectors.every(sector => sector.owner === team);
}

export function setSectorOwner(hex, sectorId, owner) {
  if (!hex?.sectors?.some?.(sector => sector.id === sectorId)) return null;
  const team = ['ally', 'enemy', 'contested'].includes(owner) ? owner : 'contested';
  const sectors = hex.sectors.map(sector => sector.id === sectorId ? { ...sector, owner: team, controlProgress: team === 'contested' ? sector.controlProgress : 1 } : { ...sector });
  return freezeHex({ ...hex, sectors });
}

const HEX_DIRECTIONS = Object.freeze([[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]);
export function neighboringHexIds(hex, allHexes) {
  if (!hex || !Array.isArray(allHexes)) return Object.freeze([]);
  const wanted = new Set(HEX_DIRECTIONS.map(([dq, dr]) => `${hex.q + dq},${hex.r + dr}`));
  return Object.freeze(allHexes.filter(candidate => wanted.has(`${candidate.q},${candidate.r}`)).map(candidate => candidate.id));
}

/**
 * Regular armies may fight in own/contested regions connected to their line.
 * Deep hostile territory is reserved for explicitly partisan/recon units.
 */
export function deploymentAllowed({ team, role = 'regular', destinationHex, allHexes = [] } = {}) {
  if (!['ally', 'enemy'].includes(team) || !destinationHex) return false;
  const control = hexControl(destinationHex);
  if (role === 'partisan' || role === 'recon') return true;
  if (control === team || control === 'contested') return true;
  const neighbors = new Set(neighboringHexIds(destinationHex, allHexes));
  return allHexes.some(hex => neighbors.has(hex.id) && hexControl(hex) === team);
}
