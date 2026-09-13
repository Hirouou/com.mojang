import { CAPITAL_STRUCTURE_CATALOG, buildCapitalLayout, distanceToCapitalRoad } from './capital-city-layout.js';

const TAU = Math.PI * 2;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value, lo)));

export const CAPITAL_VISUAL_PALETTE = Object.freeze({
  shoulder: '#544d3e',
  road: '#766a50',
  roadWear: '#948463',
  roadRut: '#4b4639',
  concrete: '#696b60',
  roof: '#626758',
  roofLight: '#7c806c',
  roofDark: '#3f463d',
  wall: '#555a50',
  civilian: '#686657',
  civilianLight: '#85806a',
  earth: '#5e5545',
  metal: '#4d564b',
  sandbag: '#82775e',
  wire: '#343a34',
  shadow: 'rgba(20,25,21,.34)',
  damage: '#3b4038',
  repair: '#a28c63',
});

function stableHash(value) {
  let hash = 2166136261;
  for (const ch of String(value ?? 'capital')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random01(seed, salt) {
  let x = (seed ^ Math.imul((salt + 1) >>> 0, 0x9e3779b1)) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return (x >>> 0) / 0xffffffff;
}

function normalizeStructures(sector) {
  const values = [
    ...(Array.isArray(sector?.structures) ? sector.structures : []),
    ...(Array.isArray(sector?.war?.structures) ? sector.war.structures : []),
    ...(Array.isArray(sector?.territory?.structures) ? sector.territory.structures : []),
  ];
  for (const base of sector?.war?.bases || []) {
    if (base?.type && CAPITAL_STRUCTURE_CATALOG[base.type]) values.push(base.type);
  }
  return [...new Set(values.filter(type => CAPITAL_STRUCTURE_CATALOG[type] && type !== 'capitalHQ'))];
}

function roadBearingsForSector(sector, roads) {
  const bearings = [];
  for (const road of roads || []) {
    const points = Array.isArray(road?.points) && road.points.length >= 2 ? road.points : [road?.from, road?.to];
    if (!points[0] || !points.at(-1)) continue;
    const ends = [points[0], points.at(-1)];
    const nearest = ends
      .map((point, index) => ({ point, index, d: Math.hypot(finite(point.x) - finite(sector.x), finite(point.y) - finite(sector.y)) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!nearest || nearest.d > 1800) continue;
    const next = nearest.index === 0 ? points[Math.min(1, points.length - 1)] : points[Math.max(0, points.length - 2)];
    if (!next) continue;
    bearings.push(Math.atan2(finite(next.y) - finite(nearest.point.y), finite(next.x) - finite(nearest.point.x)));
  }
  return bearings;
}

function developmentDensity(sector) {
  const level = Math.max(
    finite(sector?.level),
    finite(sector?.war?.level),
    finite(sector?.territory?.level),
    normalizeStructures(sector).length / 2,
  );
  return clamp(Math.round(12 + level * 5), 10, 34);
}

function stateForSector(sector) {
  const territory = sector?.territory || sector?.war?.territory || {};
  return Object.freeze({
    team: sector?.owner || sector?.team || territory?.owner || null,
    activeProject: territory?.activeProject || sector?.activeProject || sector?.war?.activeProject || null,
    projectProgress: finite(territory?.projectProgress, finite(sector?.projectProgress, finite(sector?.war?.projectProgress))),
    hqOperational: sector?.hqOperational ?? sector?.war?.hqOperational ?? territory?.hqOperational,
    structureState: sector?.structureState || sector?.war?.structureState || territory?.structureState || null,
  });
}

/**
 * Read-only adapter between the strategic/battle state and the shared capital contract.
 * Explicit layouts always win. The fallback calls buildCapitalLayout; it never creates
 * a competing geometry system inside the renderer.
 */
export function collectCapitalLayouts(state = {}) {
  const entries = [];
  const seen = new Set();
  const add = (layout, visualState = {}, sector = null) => {
    if (!layout || !layout.center || !Array.isArray(layout.roads)) return;
    const key = String(layout.id || sector?.id || `${layout.center.x}:${layout.center.y}`);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(Object.freeze({ layout, state: visualState || {}, sector }));
  };

  for (const raw of state?.warSimulation?.capitalLayouts || state?.capitalLayouts || []) {
    const layout = raw?.layout || raw;
    add(layout, raw?.state || raw?.visualState || {}, raw?.sector || null);
  }

  for (const sector of state?.sectors || []) {
    const explicit = sector?.capitalLayout || sector?.war?.capitalLayout || sector?.territory?.capitalLayout;
    if (explicit) {
      add(explicit, stateForSector(sector), sector);
      continue;
    }
    if (!Number.isFinite(sector?.x) || !Number.isFinite(sector?.y)) continue;
    const layout = buildCapitalLayout({
      id: sector.id || sector.name || `${sector.x}:${sector.y}`,
      x: sector.x,
      y: sector.y,
      roadBearings: roadBearingsForSector(sector, state?.warSimulation?.strategicRoads || []),
      structures: normalizeStructures(sector),
      density: developmentDensity(sector),
    });
    add(layout, stateForSector(sector), sector);
  }
  return Object.freeze(entries);
}

function footprintRadius(item) {
  return Math.hypot(finite(item?.width, 40), finite(item?.height, 40)) * .38;
}

function placementOnRoad(layout, item) {
  if (!layout?.roads?.length || !item) return false;
  let width = 0;
  let best = Infinity;
  for (const road of layout.roads) {
    const d = distanceToCapitalRoad({ roads: [road] }, item);
    if (d < best) { best = d; width = finite(road.width, finite(layout.rules?.primaryWidth, 72)); }
  }
  return best < width * .5 + Math.min(20, footprintRadius(item) * .22);
}

function stateForStructure(visualState, item) {
  const source = visualState?.structureState;
  if (!source) return null;
  if (source instanceof Map) return source.get(item.id) || source.get(item.type) || null;
  if (Array.isArray(source)) return source.find(entry => entry?.id === item.id || entry?.type === item.type) || null;
  if (typeof source === 'object') return source[item.id] || source[item.type] || null;
  return null;
}

function firstConstructionLot(layout, occupied) {
  for (const lot of layout?.lots || []) {
    if (occupied.has(lot.id)) continue;
    if (placementOnRoad(layout, lot)) continue;
    return lot;
  }
  return null;
}

/** Pure render plan used by tests and draw code. */
export function createCapitalVisualPlan(layout, visualState = {}) {
  if (!layout?.center || !Array.isArray(layout?.roads)) {
    return Object.freeze({ roads: Object.freeze([]), junctions: Object.freeze([]), structures: Object.freeze([]), civilian: Object.freeze([]), perimeter: Object.freeze([]), construction: null });
  }
  const occupied = new Set();
  const structures = [];
  for (const item of layout.structures || []) {
    if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
    // The HQ is the shared contract's core anchor. Other facilities are never allowed
    // to visually drift onto a protected road corridor.
    if (item.type !== 'capitalHQ' && placementOnRoad(layout, item)) continue;
    if (item.lotId) occupied.add(item.lotId);
    structures.push(Object.freeze({ ...item, status: stateForStructure(visualState, item) }));
  }
  const civilian = [];
  for (const item of layout.civilian || []) {
    if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y) || placementOnRoad(layout, item)) continue;
    if (item.lotId) occupied.add(item.lotId);
    civilian.push(item);
  }

  let construction = null;
  const project = visualState?.activeProject;
  if (project && CAPITAL_STRUCTURE_CATALOG[project] && !structures.some(item => item.type === project && item.status?.complete !== false)) {
    const lot = firstConstructionLot(layout, occupied);
    if (lot) {
      const footprint = CAPITAL_STRUCTURE_CATALOG[project].footprint;
      construction = Object.freeze({
        id: `project-${project}`,
        type: project,
        x: lot.x,
        y: lot.y,
        angle: lot.angle,
        width: footprint[0],
        height: footprint[1],
        progress: clamp(finite(visualState?.projectProgress), 0, 1),
      });
    }
  }

  return Object.freeze({
    roads: Object.freeze([...(layout.roads || [])]),
    junctions: Object.freeze(findJunctions(layout.roads || [])),
    structures: Object.freeze(structures),
    civilian: Object.freeze(civilian),
    perimeter: Object.freeze(buildPerimeter(layout)),
    construction,
  });
}

function segmentIntersection(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-6) return null;
  const q = { x: c.x - a.x, y: c.y - a.y };
  const t = (q.x * s.y - q.y * s.x) / den;
  const u = (q.x * r.y - q.y * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

function findJunctions(roads) {
  const found = [];
  for (let i = 0; i < roads.length; i++) {
    const aRoad = roads[i];
    for (let j = i + 1; j < roads.length; j++) {
      const bRoad = roads[j];
      for (let a = 1; a < (aRoad.points || []).length; a++) {
        for (let b = 1; b < (bRoad.points || []).length; b++) {
          const hit = segmentIntersection(aRoad.points[a - 1], aRoad.points[a], bRoad.points[b - 1], bRoad.points[b]);
          if (!hit) continue;
          if (found.some(point => Math.hypot(point.x - hit.x, point.y - hit.y) < 40)) continue;
          found.push(Object.freeze({ x: hit.x, y: hit.y, radius: Math.max(finite(aRoad.width, 60), finite(bRoad.width, 60)) * .62 }));
        }
      }
    }
  }
  return found;
}

function roadDistanceAt(layout, point) {
  return distanceToCapitalRoad(layout, point);
}

function buildPerimeter(layout) {
  if (!layout?.center || !layout?.radius) return [];
  const segments = [];
  const pieces = 32;
  const radius = layout.radius * .79;
  for (let i = 0; i < pieces; i++) {
    const a0 = i / pieces * TAU;
    const a1 = (i + .82) / pieces * TAU;
    const mid = (a0 + a1) * .5;
    const midpoint = { x: layout.center.x + Math.cos(mid) * radius, y: layout.center.y + Math.sin(mid) * radius };
    const roadGap = roadDistanceAt(layout, midpoint) < finite(layout.rules?.primaryWidth, 72) * .8 + 46;
    if (roadGap) continue;
    const wobble0 = (random01(layout.seed || 1, 9000 + i) - .5) * 18;
    const wobble1 = (random01(layout.seed || 1, 9100 + i) - .5) * 18;
    segments.push(Object.freeze({
      x1: layout.center.x + Math.cos(a0) * (radius + wobble0),
      y1: layout.center.y + Math.sin(a0) * (radius + wobble0),
      x2: layout.center.x + Math.cos(a1) * (radius + wobble1),
      y2: layout.center.y + Math.sin(a1) * (radius + wobble1),
      wire: i % 3 !== 0,
    }));
  }
  return segments;
}

function screenPoint(frame, point) {
  return frame.worldToScreen(point.x, point.y);
}

function strokeWorldPath(ctx, frame, points, width, color, { dash = null, cap = 'butt', join = 'round' } = {}) {
  if (!Array.isArray(points) || points.length < 2) return;
  const first = screenPoint(frame, points[0]);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(.65, width * frame.zoom);
  ctx.lineCap = cap;
  ctx.lineJoin = join;
  if (ctx.setLineDash) ctx.setLineDash(dash ? dash.map(value => value * frame.zoom) : []);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = screenPoint(frame, points[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawRoads(ctx, layout, plan, frame) {
  for (const road of plan.roads) {
    const width = finite(road.width, finite(layout.rules?.primaryWidth, 72));
    const shoulder = finite(road.shoulder, finite(layout.rules?.shoulderWidth, 18));
    strokeWorldPath(ctx, frame, road.points, width + shoulder * 2, CAPITAL_VISUAL_PALETTE.shoulder);
  }
  for (const road of plan.roads) {
    const width = finite(road.width, finite(layout.rules?.primaryWidth, 72));
    strokeWorldPath(ctx, frame, road.points, width, CAPITAL_VISUAL_PALETTE.road);
  }

  // Fused junction surfaces hide individual segment ends and remove the airport-X read.
  for (const junction of plan.junctions) {
    const p = screenPoint(frame, junction);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = CAPITAL_VISUAL_PALETTE.road;
    ctx.beginPath();
    const r = Math.max(1.5, junction.radius * frame.zoom);
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * TAU;
      const wobble = .88 + random01(layout.seed || 1, 12000 + i) * .18;
      const x = Math.cos(angle) * r * wobble, y = Math.sin(angle) * r * wobble;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  for (let roadIndex = 0; roadIndex < plan.roads.length; roadIndex++) {
    const road = plan.roads[roadIndex];
    const width = finite(road.width, 64);
    strokeWorldPath(ctx, frame, road.points, width * .48, 'rgba(166,146,105,.13)');
    const rut = Math.max(2, width * .045);
    const points = road.points || [];
    for (const side of [-1, 1]) {
      const shifted = points.map((point, index) => {
        const prev = points[Math.max(0, index - 1)] || point;
        const next = points[Math.min(points.length - 1, index + 1)] || point;
        const dx = next.x - prev.x, dy = next.y - prev.y, length = Math.hypot(dx, dy) || 1;
        const offset = width * .23 * side;
        return { x: point.x - dy / length * offset, y: point.y + dx / length * offset };
      });
      strokeWorldPath(ctx, frame, shifted, rut, 'rgba(58,54,45,.34)');
    }

    for (let i = 2; i < points.length - 1; i += 4) {
      const point = points[i];
      const p = screenPoint(frame, point);
      const radius = Math.max(1.2, width * frame.zoom * (.045 + random01(layout.seed || 1, 15000 + roadIndex * 100 + i) * .04));
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = i % 3 ? 'rgba(56,52,43,.18)' : 'rgba(95,84,62,.22)';
      ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.7, radius * .7, random01(layout.seed || 1, 15100 + i) * Math.PI, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

function buildingColors(item, team, damaged) {
  if (damaged) return ['#353b34', '#4a4d42', '#2a302a'];
  const enemy = team === 'enemy';
  const cls = CAPITAL_STRUCTURE_CATALOG[item.type]?.className;
  if (item.type === 'capitalHQ') return enemy ? ['#65594c', '#83715b', '#403b34'] : ['#536056', '#788071', '#37443b'];
  if (cls === 'industry') return ['#50554d', '#6e7063', '#363c36'];
  if (cls === 'ammo') return ['#5d5947', '#7a7053', '#3d3d31'];
  if (cls === 'medical') return ['#6a6b60', '#8c8b79', '#454a42'];
  if (cls === 'fortification' || cls === 'weapon') return ['#4d5249', '#6a6b5e', '#313831'];
  return enemy ? ['#625d4e', '#7d735d', '#3f3e34'] : ['#596052', '#757963', '#3b4339'];
}

function drawRotatedBuilding(ctx, item, frame, team, visualState, civilian = false) {
  const p = screenPoint(frame, item);
  const width = Math.max(5, finite(item.width, 70) * frame.zoom);
  const height = Math.max(4, finite(item.height, 52) * frame.zoom);
  const status = civilian ? null : stateForStructure(visualState, item);
  const damaged = status?.destroyed || status?.alive === false || finite(status?.hp, 1) <= 0 || (item.type === 'capitalHQ' && visualState?.hqOperational === false);
  const colors = civilian
    ? [CAPITAL_VISUAL_PALETTE.civilian, CAPITAL_VISUAL_PALETTE.civilianLight, '#45453b']
    : buildingColors(item, team, damaged);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(finite(item.angle));
  ctx.fillStyle = CAPITAL_VISUAL_PALETTE.shadow;
  ctx.fillRect(-width * .5 + 3, -height * .5 + 4, width, height);
  ctx.fillStyle = colors[0];
  ctx.fillRect(-width * .5, -height * .5, width, height);
  ctx.fillStyle = colors[1];
  ctx.beginPath();
  ctx.moveTo(-width * .5, -height * .5);
  ctx.lineTo(width * .38, -height * .5);
  ctx.lineTo(width * .5, -height * .3);
  ctx.lineTo(-width * .38, -height * .3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = colors[2];
  ctx.fillRect(-width * .42, height * .28, width * .24, Math.max(2, height * .16));

  if (civilian) {
    if (item.type === 'civilWarehouse') {
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = '#4a4b40'; ctx.fillRect(i * width * .22 - width * .055, -height * .36, width * .11, height * .72);
      }
    } else {
      ctx.fillStyle = '#343a33'; ctx.fillRect(width * .08, -height * .16, width * .17, height * .17);
      ctx.fillStyle = '#8d8064'; ctx.fillRect(-width * .3, -height * .16, width * .14, height * .12);
    }
    ctx.restore();
    return;
  }

  const cls = CAPITAL_STRUCTURE_CATALOG[item.type]?.className;
  if (item.type === 'capitalHQ') {
    ctx.strokeStyle = team === 'enemy' ? '#b99a75' : '#a8b8a7';
    ctx.lineWidth = Math.max(1, 2.5 * frame.zoom);
    ctx.strokeRect(-width * .31, -height * .31, width * .62, height * .62);
    ctx.fillStyle = '#292f2b'; ctx.fillRect(-width * .08, -height * .62, width * .16, height * .33);
    ctx.fillStyle = team === 'enemy' ? '#b38268' : '#91aa98'; ctx.fillRect(width * .03, -height * .67, width * .27, Math.max(2, height * .1));
  } else if (cls === 'logistics' || cls === 'industry') {
    const bays = cls === 'industry' ? 4 : 3;
    for (let i = 0; i < bays; i++) {
      ctx.fillStyle = '#313831';
      ctx.fillRect(-width * .4 + i * width * .25, height * .18, width * .15, height * .18);
    }
  } else if (cls === 'medical') {
    ctx.fillStyle = '#a4a18b'; ctx.fillRect(-width * .05, -height * .24, width * .1, height * .48);
    ctx.fillRect(-width * .23, -height * .06, width * .46, height * .12);
  } else if (cls === 'weapon') {
    ctx.fillStyle = '#303830';
    ctx.beginPath(); ctx.arc(0, 0, Math.min(width, height) * .24, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#9b9476'; ctx.lineWidth = Math.max(1.3, 4 * frame.zoom);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(width * .42, 0); ctx.stroke();
  } else if (cls === 'fortification') {
    ctx.fillStyle = '#252c27'; ctx.fillRect(-width * .26, height * .24, width * .52, height * .12);
  }

  if (damaged) {
    ctx.fillStyle = 'rgba(20,23,20,.52)';
    ctx.beginPath(); ctx.arc(width * .08, -height * .08, Math.max(2, Math.min(width, height) * .18), 0, TAU); ctx.fill();
    ctx.strokeStyle = '#272b27'; ctx.lineWidth = Math.max(1, 2 * frame.zoom);
    ctx.beginPath(); ctx.moveTo(-width * .4, -height * .28); ctx.lineTo(width * .22, height * .31); ctx.moveTo(width * .35, -height * .36); ctx.lineTo(-width * .04, height * .34); ctx.stroke();
  }
  ctx.restore();
}

function drawPerimeter(ctx, plan, frame) {
  for (const segment of plan.perimeter) {
    const a = screenPoint(frame, { x: segment.x1, y: segment.y1 });
    const b = screenPoint(frame, { x: segment.x2, y: segment.y2 });
    ctx.save();
    ctx.strokeStyle = CAPITAL_VISUAL_PALETTE.wall;
    ctx.lineWidth = Math.max(1.4, 8 * frame.zoom);
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (segment.wire) {
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length, ny = dx / length;
      ctx.strokeStyle = CAPITAL_VISUAL_PALETTE.wire;
      ctx.lineWidth = Math.max(.7, 2 * frame.zoom);
      ctx.beginPath();
      const steps = Math.max(2, Math.ceil(length / 8));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wave = (i % 2 ? 1 : -1) * Math.max(1.2, 4 * frame.zoom);
        const x = a.x + dx * t + nx * wave, y = a.y + dy * t + ny * wave;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawConstruction(ctx, item, frame) {
  if (!item) return;
  const p = screenPoint(frame, item);
  const width = Math.max(8, item.width * frame.zoom), height = Math.max(7, item.height * frame.zoom);
  const progress = clamp(item.progress, 0, 1);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(finite(item.angle));
  ctx.fillStyle = 'rgba(70,61,48,.68)'; ctx.fillRect(-width * .56, -height * .58, width * 1.12, height * 1.16);
  ctx.strokeStyle = '#91836a'; ctx.lineWidth = Math.max(1, 3 * frame.zoom);
  ctx.strokeRect(-width * .43, -height * .38, width * .86, height * .76);
  ctx.fillStyle = '#77705a';
  ctx.fillRect(-width * .43, -height * .38, width * .86 * progress, Math.max(2, height * .12));
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#464a40';
    ctx.beginPath(); ctx.moveTo(side * width * .52, -height * .55); ctx.lineTo(side * width * .52, height * .55); ctx.stroke();
  }
  ctx.strokeStyle = '#a39271';
  ctx.beginPath(); ctx.moveTo(-width * .58, -height * .48); ctx.lineTo(width * .58, -height * .48); ctx.moveTo(-width * .58, height * .48); ctx.lineTo(width * .58, height * .48); ctx.stroke();
  ctx.fillStyle = '#5b5546'; ctx.fillRect(width * .28, height * .18, width * .2, height * .2);
  ctx.fillStyle = '#8b7b5e'; ctx.fillRect(-width * .47, height * .21, width * .16, height * .14);
  ctx.restore();
}

export function drawCapitalLayout(ctx, layout, frame, visualState = {}) {
  if (!ctx || !layout?.center || typeof frame?.worldToScreen !== 'function') return Object.freeze({ roads: 0, structures: 0, civilian: 0 });
  const radius = finite(layout.radius, 1100);
  if (frame.visible && !frame.visible(layout.center.x, layout.center.y, radius * frame.zoom + 160)) return Object.freeze({ roads: 0, structures: 0, civilian: 0 });
  const plan = createCapitalVisualPlan(layout, visualState);
  drawRoads(ctx, layout, plan, frame);
  drawPerimeter(ctx, plan, frame);
  const team = visualState?.team || 'neutral';
  for (const item of plan.civilian) drawRotatedBuilding(ctx, item, frame, team, visualState, true);
  for (const item of plan.structures) drawRotatedBuilding(ctx, item, frame, team, visualState, false);
  drawConstruction(ctx, plan.construction, frame);
  return Object.freeze({ roads: plan.roads.length, structures: plan.structures.length + (plan.construction ? 1 : 0), civilian: plan.civilian.length });
}

export function drawCapitalCities(ctx, state, frame) {
  if (!ctx || !state || typeof frame?.worldToScreen !== 'function') return Object.freeze({ capitals: 0, roads: 0, structures: 0, civilian: 0 });
  let capitals = 0, roads = 0, structures = 0, civilian = 0;
  for (const entry of collectCapitalLayouts(state)) {
    const result = drawCapitalLayout(ctx, entry.layout, frame, entry.state);
    if (!result.roads && !result.structures && !result.civilian) continue;
    capitals += 1; roads += result.roads; structures += result.structures; civilian += result.civilian;
  }
  return Object.freeze({ capitals, roads, structures, civilian });
}
