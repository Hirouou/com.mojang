import { THEATRE_SIZE, controlLineX, lineSnapshot, shiftControlLine } from './theatre-control.js';

const SQRT3 = Math.sqrt(3);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));

export const STRATEGIC_HEX = Object.freeze({
  // Visual scale follows MAP_REFERENCE_20260912.svg: fewer, clearly readable
  // strategic regions instead of a dense debug-like honeycomb.
  radius: 8_400,
  sectorRadius: 3_300,
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
 * The strategic map starts with a coherent west/east split plus one contiguous
 * no-man's-land corridor. The innermost strip is actively contested; the wider
 * strip is neutral/unclaimed. This avoids arbitrary enemy pockets behind lines.
 */
export function strategicOwnerAt({ x, y } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'neutral';
  const delta = x - controlLineX(y);
  const distance = Math.abs(delta);
  if (distance <= 1_350) return 'contested';
  if (distance <= 5_250) return 'neutral';
  return delta < 0 ? 'ally' : 'enemy';
}

/**
 * Strategic world regions inspired by large persistent-war maps, while keeping
 * Iron Rain's own theatre scale/rules. Every large hex contains seven sectors.
 */
export function createStrategicHexMap({ width = THEATRE_SIZE.w, height = THEATRE_SIZE.h, radius = STRATEGIC_HEX.radius } = {}) {
  const margin = radius * .92;
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
          owner: strategicOwnerAt({ x: sx, y: sy }),
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
  const owners = (hex?.sectors || []).map(sector => sector.owner);
  if (!owners.length) return 'neutral';
  if (owners.every(owner => owner === 'ally')) return 'ally';
  if (owners.every(owner => owner === 'enemy')) return 'enemy';
  if (owners.every(owner => owner === 'neutral')) return 'neutral';
  return 'contested';
}

/** A region flips only after every internal sector is controlled by that faction. */
export function canCaptureHex(hex, team) {
  if (!['ally', 'enemy'].includes(team) || !Array.isArray(hex?.sectors) || !hex.sectors.length) return false;
  return hex.sectors.every(sector => sector.owner === team);
}

export function setSectorOwner(hex, sectorId, owner) {
  if (!hex?.sectors?.some?.(sector => sector.id === sectorId)) return null;
  const team = ['ally', 'enemy', 'contested', 'neutral'].includes(owner) ? owner : 'neutral';
  const sectors = hex.sectors.map(sector => sector.id === sectorId ? { ...sector, owner: team, controlProgress: team === 'ally' || team === 'enemy' ? 1 : sector.controlProgress } : { ...sector });
  return freezeHex({ ...hex, sectors });
}

const HEX_DIRECTIONS = Object.freeze([[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]);
const RING_TO_HEX_DIRECTION = Object.freeze({
  1: Object.freeze([0, -1]),
  2: Object.freeze([1, -1]),
  3: Object.freeze([1, 0]),
  4: Object.freeze([0, 1]),
  5: Object.freeze([-1, 1]),
  6: Object.freeze([-1, 0]),
});

export function neighboringHexIds(hex, allHexes) {
  if (!hex || !Array.isArray(allHexes)) return Object.freeze([]);
  const wanted = new Set(HEX_DIRECTIONS.map(([dq, dr]) => `${hex.q + dq},${hex.r + dr}`));
  return Object.freeze(allHexes.filter(candidate => wanted.has(`${candidate.q},${candidate.r}`)).map(candidate => candidate.id));
}

const adjacentSectorIndexes = index => {
  if (index === 0) return [1, 2, 3, 4, 5, 6];
  if (index < 1 || index > 6) return [];
  return [0, index === 1 ? 6 : index - 1, index === 6 ? 1 : index + 1];
};

/**
 * A normal sector capture must stay physically connected to the faction's
 * existing line. Inner sectors advance from an adjacent friendly sector; a
 * border sector may also be entered from the matching neighboring hex, but only
 * when that neighboring region is fully controlled by the same faction.
 *
 * This is deliberately conservative: it prevents isolated ownership islands
 * that would bend the visible front without a continuous advance path.
 */
export function sectorCaptureAllowed({ team, hex, sectorId, allHexes = [] } = {}) {
  if (!['ally', 'enemy'].includes(team) || !Array.isArray(hex?.sectors)) return false;
  const targetIndex = hex.sectors.findIndex(sector => sector.id === sectorId);
  if (targetIndex < 0) return false;
  if (hex.sectors[targetIndex].owner === team) return true;

  if (adjacentSectorIndexes(targetIndex).some(index => hex.sectors[index]?.owner === team)) return true;
  if (targetIndex === 0 || !Array.isArray(allHexes)) return false;

  const direction = RING_TO_HEX_DIRECTION[targetIndex];
  if (!direction || !Number.isFinite(hex.q) || !Number.isFinite(hex.r)) return false;
  const [dq, dr] = direction;
  const neighbor = allHexes.find(candidate => candidate?.q === hex.q + dq && candidate?.r === hex.r + dr);
  return hexControl(neighbor) === team;
}

/**
 * Resolve a connected sector capture and its front deformation atomically.
 * This keeps ownership and the canonical theatre line from drifting into two
 * independent truths: Allied gains push the local line east, Axis gains push it
 * west, and rejected captures leave both snapshots unchanged.
 */
export function captureSectorWithFront({
  team,
  hex,
  sectorId,
  allHexes = [],
  points,
  pushMetres = 1_800,
  radius = 9_000,
} = {}) {
  const line = lineSnapshot(points);
  if (!sectorCaptureAllowed({ team, hex, sectorId, allHexes })) {
    return Object.freeze({ ok: false, changed: false, reason: 'disconnected', hex, line });
  }

  const sector = hex?.sectors?.find?.(candidate => candidate.id === sectorId);
  if (!sector) return Object.freeze({ ok: false, changed: false, reason: 'missing-sector', hex, line });
  if (sector.owner === team) return Object.freeze({ ok: true, changed: false, reason: 'already-owned', hex, line });

  const nextHex = setSectorOwner(hex, sectorId, team);
  const magnitude = Math.abs(Number.isFinite(pushMetres) ? pushMetres : 0);
  const signedPush = team === 'ally' ? magnitude : -magnitude;
  const nextLine = shiftControlLine(line, sector.y, signedPush, radius);
  return Object.freeze({ ok: true, changed: true, reason: 'captured', hex: nextHex, line: nextLine });
}

/**
 * Regular armies may fight in own/contested/neutral frontier regions connected
 * to their line. Deep hostile territory is reserved for partisan/recon units.
 */
export function deploymentAllowed({ team, role = 'regular', destinationHex, allHexes = [] } = {}) {
  if (!['ally', 'enemy'].includes(team) || !destinationHex) return false;
  const control = hexControl(destinationHex);
  if (role === 'partisan' || role === 'recon') return true;
  if (control === team || control === 'contested' || control === 'neutral') return true;
  const neighbors = new Set(neighboringHexIds(destinationHex, allHexes));
  return allHexes.some(hex => neighbors.has(hex.id) && hexControl(hex) === team);
}
