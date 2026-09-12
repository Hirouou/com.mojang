export * from './war-simulation-core.js';
import {
  updateWar as coreUpdateWar,
  assessRoute as coreAssessRoute,
  checkRouteAmbush as coreCheckRouteAmbush,
  getFrontGeometry,
} from './war-simulation-core.js';
import { createStrategicHexMap, strategicOwnerAt } from './strategic-hex-map.js';
import { THEATRE_SIZE, controlLineX } from './theatre-control.js';

const canonicalHexes = createStrategicHexMap();
const canonicalSectors = canonicalHexes.flatMap(hex => hex.sectors.map(sector => ({ ...sector, hexId: hex.id, hexName: hex.name })));
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const playerTeam = () => globalThis.ironRainEntry?.faction === 'axis' ? 'enemy' : 'ally';
const frontDistance = point => finitePoint(point) ? Math.abs(point.x - controlLineX(point.y)) : Infinity;
const LEGACY_GAME_SECTORS = new Set(['FALCON', 'BIRCH', 'CINDER', 'DAGGER', 'ECHO', 'FROST', 'LINHA 07']);

function isLiveGameState(state) {
  if (state?.warSimulation?.strategicIntegration === true) return true;
  return Boolean(
    Array.isArray(state?.sectors) &&
    state.sectors.length === 7 &&
    state.sectors.every(sector => LEGACY_GAME_SECTORS.has(sector?.name)) &&
    finitePoint(state?.robot) &&
    finitePoint(state?.base)
  );
}

function locateStrategic(point) {
  if (!finitePoint(point)) return null;
  let hex = null, hexDistance = Infinity;
  for (const candidate of canonicalHexes) {
    const current = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (current < hexDistance) { hex = candidate; hexDistance = current; }
  }
  if (!hex) return null;
  let sector = hex.sectors[0] || null, sectorDistance = Infinity;
  for (const candidate of hex.sectors) {
    const current = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (current < sectorDistance) { sector = candidate; sectorDistance = current; }
  }
  return sector ? { hexId: hex.id, hexName: hex.name, sectorId: sector.id, sectorName: sector.name, owner: sector.owner, distanceToFront: frontDistance(point) } : null;
}

function chooseTacticalTargets(count) {
  const picked = [], used = new Set();
  for (let index = 0; index < count; index++) {
    const targetY = THEATRE_SIZE.h * (index + .5) / count;
    let best = null, bestScore = Infinity;
    for (const sector of canonicalSectors) {
      if (used.has(sector.id)) continue;
      const ownershipPenalty = sector.owner === 'contested' ? 0 : sector.owner === 'neutral' ? 900 : 4_500;
      const score = Math.abs(sector.y - targetY) * .55 + frontDistance(sector) * 1.8 + ownershipPenalty;
      if (score < bestScore) { best = sector; bestScore = score; }
    }
    if (best) { used.add(best.id); picked.push(best); }
  }
  return picked;
}

function shiftPoint(point, dx, dy) {
  if (!finitePoint(point)) return;
  point.x += dx;
  point.y += dy;
}

function alignSector(sec, target) {
  if (!sec || !target || sec.__ironRainStrategicAligned) return;
  const dx = target.x - sec.x, dy = target.y - sec.y;
  shiftPoint(sec, dx, dy);
  for (const item of sec.assets || []) shiftPoint(item, dx, dy);
  for (const item of sec.units || []) shiftPoint(item, dx, dy);
  const war = sec.war;
  if (war) {
    for (const item of war.bases || []) shiftPoint(item, dx, dy);
    for (const item of war.vehicles || []) shiftPoint(item, dx, dy);
    for (const item of war.mortars || []) shiftPoint(item, dx, dy);
    for (const item of war.oldTrenches || []) shiftPoint(item, dx, dy);
  }
  sec.name = `${target.hexName} / ${target.name}`;
  sec.strategicHexId = target.hexId;
  sec.strategicSectorId = target.id;
  sec.strategicOwner = target.owner;
  sec.__ironRainStrategicAligned = true;
}

function ensureStrategicAlignment(state) {
  if (!isLiveGameState(state) || state.warSimulation?.strategicAligned) return false;
  state.warSimulation ||= {};
  state.warSimulation.strategicIntegration = true;
  const targets = chooseTacticalTargets(state.sectors.length);
  state.sectors.forEach((sector, index) => alignSector(sector, targets[index]));
  state.warSimulation.strategicAligned = true;
  return true;
}

function routeInsideFriendly(from, to, team) {
  if (!finitePoint(from) || !finitePoint(to)) return false;
  for (let index = 0; index <= 8; index++) {
    const t = index / 8;
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    if (strategicOwnerAt(point) !== team) return false;
  }
  return true;
}

function publishWorldBridge(state) {
  if (!isLiveGameState(state) || !state?.robot) return;
  const location = locateStrategic(state.robot);
  const fronts = (state.sectors || []).map(sec => {
    const center = sec.war ? getFrontGeometry(sec).center : sec;
    return {
      id: sec.id,
      name: sec.name,
      strategicHexId: sec.strategicHexId || null,
      strategicSectorId: sec.strategicSectorId || null,
      x: center.x,
      y: center.y,
      status: sec.status || 'stalemate',
      progress: Number(sec.progress) || 0,
      allyStrength: Number(sec.allyStrength) || 0,
      enemyStrength: Number(sec.enemyStrength) || 0,
    };
  });
  globalThis.ironRainWarBridge = {
    version: 1,
    position: { x: state.robot.x, y: state.robot.y },
    location,
    playerTeam: playerTeam(),
    safeRear: Boolean(location && location.owner === playerTeam() && location.distanceToFront > 5_250),
    fronts,
  };
}

export function updateWar(state, dt) {
  const live = isLiveGameState(state);
  if (live) ensureStrategicAlignment(state);
  const originalMode = state?.mode;
  const team = playerTeam();
  const rearSafe = Boolean(live && state?.robot && strategicOwnerAt(state.robot) === team && frontDistance(state.robot) > 5_250);
  if (rearSafe && originalMode === 'march') state.mode = 'strategic-rear';
  try {
    coreUpdateWar(state, dt);
  } finally {
    if (rearSafe && state) state.mode = originalMode;
    if (live) publishWorldBridge(state);
  }
}

export function assessRoute(state, from, to) {
  if (!isLiveGameState(state)) return coreAssessRoute(state, from, to);
  ensureStrategicAlignment(state);
  const team = playerTeam();
  if (routeInsideFriendly(from, to, team)) {
    return {
      safe: true,
      risk: .06,
      reasons: ['Corredor dentro de território amigo confirmado pelo mapa estratégico.'],
      checkpoints: [{ ...from, status: 'secured', risk: .06 }, { ...to, status: 'secured', risk: .06 }],
      gaps: [],
      partisanRisk: 0,
      strategicSafe: true,
    };
  }
  return coreAssessRoute(state, from, to);
}

export function checkRouteAmbush(state, route, dt = 4) {
  if (route?.strategicSafe) return null;
  return coreCheckRouteAmbush(state, route, dt);
}
