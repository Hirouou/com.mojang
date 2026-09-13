export * from './war-simulation-core.js';
import {
  updateWar as coreUpdateWar,
  assessRoute as coreAssessRoute,
  checkRouteAmbush as coreCheckRouteAmbush,
  getFrontGeometry,
} from './war-simulation-core.js';
import { combatSustainmentSupply } from './combat-sustainment.js';
import { localConvoyMaterializationFeed } from './local-missions.js';
import { createStrategicHexMap, strategicOwnerAt } from './strategic-hex-map.js';
import { THEATRE_SIZE, controlLineX } from './theatre-control.js';

const canonicalHexes = createStrategicHexMap();
const canonicalSectors = canonicalHexes.flatMap(hex => hex.sectors.map(sector => ({ ...sector, hexId: hex.id, hexName: hex.name })));
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const playerTeam = () => globalThis.ironRainEntry?.faction === 'axis' ? 'enemy' : 'ally';
const frontDistance = point => finitePoint(point) ? Math.abs(point.x - controlLineX(point.y)) : Infinity;
const LEGACY_GAME_SECTORS = new Set(['FALCON', 'BIRCH', 'CINDER', 'DAGGER', 'ECHO', 'FROST', 'LINHA 07']);
const COMBAT_RESERVE_REAR_STEPS = Object.freeze([9_000, 12_000, 15_500, 19_000, 24_000]);
const LOCAL_ROAD_RADIUS = 12_000;
const LOCAL_CAPITAL_RADIUS = 6_500;

function isLiveGameState(state) {
  if (state?.warSimulation?.strategicIntegration === true) return true;
  return Boolean(Array.isArray(state?.sectors) && state.sectors.length === 7 && state.sectors.every(sector => LEGACY_GAME_SECTORS.has(sector?.name)) && finitePoint(state?.robot) && finitePoint(state?.base));
}

function locateStrategic(point) {
  if (!finitePoint(point)) return null;
  let hex = null, hexDistance = Infinity;
  for (const candidate of canonicalHexes) { const current = Math.hypot(point.x - candidate.x, point.y - candidate.y); if (current < hexDistance) { hex = candidate; hexDistance = current; } }
  if (!hex) return null;
  let sector = hex.sectors[0] || null, sectorDistance = Infinity;
  for (const candidate of hex.sectors) { const current = Math.hypot(point.x - candidate.x, point.y - candidate.y); if (current < sectorDistance) { sector = candidate; sectorDistance = current; } }
  return sector ? { hexId: hex.id, hexName: hex.name, sectorId: sector.id, sectorName: sector.name, owner: sector.owner, distanceToFront: frontDistance(point) } : null;
}

function validSpawn(spawn, team = playerTeam()) {
  if (!finitePoint(spawn) || !spawn.id) return false;
  const hex = canonicalHexes.find(candidate => candidate.id === spawn.id);
  if (!hex) return false;
  return hex.sectors.every(sector => sector.owner === team) && Math.hypot(hex.x - spawn.x, hex.y - spawn.y) < 10;
}

function placeMamuteAtSpawn(state, spawn, reason = 'entry') {
  if (!isLiveGameState(state) || !validSpawn(spawn)) return false;
  const x = Math.max(600, Math.min(THEATRE_SIZE.w - 600, Number(spawn.x))), y = Math.max(600, Math.min(THEATRE_SIZE.h - 600, Number(spawn.y))), rear = playerTeam() === 'ally' ? -450 : 450;
  state.robot.x = x; state.robot.y = y; state.robot.speed = 0;
  if (reason === 'respawn') {
    state.robot.armor = 100;
    if (state.engine) { state.engine.health = 100; state.engine.fire = 0; state.engine.hasExtinguisher = false; state.engine.repairProgress = 0; state.engine.repairing = false; state.engine.action = null; }
    state.engineLastArmor = 100;
    state.loading = null;
    state.shell = null;
    state.relocation = null;
  }
  if (state.cam) { state.cam.x = x + rear * -.65; state.cam.y = y; state.cam.manualX = 0; state.cam.manualY = 0; }
  if (state.base) { state.base.x = x + rear; state.base.y = y; }
  state.warSimulation ||= {};
  state.warSimulation.spawnApplied = spawn.id;
  state.warSimulation.spawnReason = reason;
  state.warSimulation.spawnAt = { x, y };
  state.warSimulation.destroyedNotified = false;
  return true;
}

function ensureChosenSpawn(state) {
  if (!isLiveGameState(state)) return false;
  const entry = globalThis.ironRainEntry;
  const pending = entry?.pendingRespawn;
  if (pending && validSpawn(pending)) {
    const applied = placeMamuteAtSpawn(state, pending, 'respawn');
    if (applied) {
      entry.spawn = { ...pending }; entry.pendingRespawn = null;
      try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:respawn-applied', { detail: { spawn: { ...pending } } })); } catch {}
    }
    return applied;
  }
  const spawn = entry?.spawn || globalThis.ironRainSpawnChoice;
  if (!spawn || state.warSimulation?.spawnApplied === spawn.id) return false;
  const applied = placeMamuteAtSpawn(state, spawn, 'entry');
  if (applied && entry) entry.spawn = { ...spawn };
  return applied;
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

function shiftPoint(point, dx, dy) { if (!finitePoint(point)) return; point.x += dx; point.y += dy; }
function alignSector(sec, target) {
  if (!sec || !target || sec.__ironRainStrategicAligned) return;
  const dx = target.x - sec.x, dy = target.y - sec.y;
  shiftPoint(sec, dx, dy);
  for (const item of sec.assets || []) shiftPoint(item, dx, dy);
  for (const item of sec.units || []) shiftPoint(item, dx, dy);
  const war = sec.war;
  if (war) { for (const item of war.bases || []) shiftPoint(item, dx, dy); for (const item of war.vehicles || []) shiftPoint(item, dx, dy); for (const item of war.mortars || []) shiftPoint(item, dx, dy); for (const item of war.oldTrenches || []) shiftPoint(item, dx, dy); }
  sec.name = `${target.hexName} / ${target.name}`; sec.strategicHexId = target.hexId; sec.strategicSectorId = target.id; sec.strategicOwner = target.owner; sec.__ironRainStrategicAligned = true;
}

function ensureStrategicAlignment(state) {
  if (!isLiveGameState(state) || state.warSimulation?.strategicAligned) return false;
  state.warSimulation ||= {}; state.warSimulation.strategicIntegration = true;
  const targets = chooseTacticalTargets(state.sectors.length); state.sectors.forEach((sector, index) => alignSector(sector, targets[index])); state.warSimulation.strategicAligned = true; return true;
}

function refreshCombatReserveContext(state) {
  if (!isLiveGameState(state)) return;
  state.warSimulation ||= {};
  const strategicMap = globalThis.ironRainStrategicMap;
  if (typeof strategicMap?.combatReserveContext !== 'function') {
    state.warSimulation.combatReserveContext = null;
    return;
  }
  state.warSimulation.combatReserveContext = ({ sectorId, team }) => {
    const fieldReady = context => context?.territory?.owner === team && context.territory.contested === false &&
      context.territory.structures?.some?.(type => type === 'outpost' || type === 'depot' || type === 'garage');
    const direct = strategicMap.combatReserveContext(sectorId, team);
    if (fieldReady(direct)) return direct;
    if (!['ally', 'enemy'].includes(team) || typeof strategicMap.locate !== 'function') return null;
    const front = state.sectors?.find(candidate => candidate.strategicSectorId === sectorId);
    if (!front) return null;
    const center = front.war ? getFrontGeometry(front).center : front;
    const direction = team === 'ally' ? -1 : 1;
    for (const metres of COMBAT_RESERVE_REAR_STEPS) {
      const located = strategicMap.locate({ x: center.x + direction * metres, y: center.y });
      const staging = located?.sector;
      if (!staging || staging.owner !== team) continue;
      const context = strategicMap.combatReserveContext(staging.id, team);
      if (fieldReady(context)) return context;
    }
    return null;
  };
}

function stagingContext(state, sectorId, team) {
  const contextFor = state?.warSimulation?.combatReserveContext;
  if (typeof contextFor !== 'function') return null;
  try { return contextFor({ sectorId, team }) || null; } catch { return null; }
}

function syncCombatSustainment(state) {
  const contextFor = state?.warSimulation?.combatReserveContext;
  if (typeof contextFor !== 'function') return;
  for (const sector of state.sectors || []) {
    if (!sector?.strategicSectorId || !sector.war?.bases) continue;
    for (const team of ['ally', 'enemy']) {
      let context = null;
      try { context = contextFor({ sectorId: sector.strategicSectorId, team }); } catch {}
      if (!context) continue;
      const supplyCap = combatSustainmentSupply({ ...context, team });
      for (const base of sector.war.bases) {
        if (base?.alive && base.team === team) base.supply = Math.min(Number(base.supply) || 0, supplyCap);
      }
    }
  }
}

function strategicAssetSnapshot(state) {
  const snapshot = new Map();
  for (const sector of state?.sectors || []) {
    if (!sector?.war || !sector.strategicSectorId) continue;
    for (const team of ['ally', 'enemy']) {
      const force = sector.war[team];
      snapshot.set(`${sector.id}:${team}`, {
        strength: Number(sector[team === 'ally' ? 'allyStrength' : 'enemyStrength']) || 0,
        reinforcements: Number(force?.reinforcements) || 0,
      });
    }
    for (const tank of sector.war.vehicles || []) snapshot.set(`tank:${tank.id}`, { alive: tank.alive !== false, claimed: tank.__strategicAssetClaimed === true });
  }
  return snapshot;
}

function reconcileStrategicAssets(state, before) {
  if (!before) return;
  for (const sector of state?.sectors || []) {
    if (!sector?.war || !sector.strategicSectorId) continue;
    for (const team of ['ally', 'enemy']) {
      const key = team === 'ally' ? 'allyStrength' : 'enemyStrength';
      const force = sector.war[team];
      const previous = before.get(`${sector.id}:${team}`);
      if (!previous || !force) continue;
      const reinforcementDelta = Math.max(0, (Number(force.reinforcements) || 0) - previous.reinforcements);
      if (reinforcementDelta <= 0) continue;
      const context = stagingContext(state, sector.strategicSectorId, team);
      const requested = Math.max(1, Math.ceil(reinforcementDelta));
      const available = Math.max(0, Math.floor(Number(context?.assetCount?.('troops')) || 0));
      const accepted = Math.min(requested, available);
      if (accepted > 0) context?.claimAsset?.('troops', accepted);
      if (accepted < requested) {
        const allowedDelta = reinforcementDelta * (accepted / requested);
        const rollback = Math.max(0, reinforcementDelta - allowedDelta);
        sector[key] = Math.max(previous.strength, (Number(sector[key]) || 0) - rollback);
        force.reinforcements = Math.max(previous.reinforcements, (Number(force.reinforcements) || 0) - rollback);
      }
    }
    for (const tank of sector.war.vehicles || []) {
      if (tank?.type !== 'tank') continue;
      const previous = before.get(`tank:${tank.id}`) || { alive: false, claimed: false };
      if (tank.alive === false) {
        if (previous.claimed) tank.__strategicAssetClaimed = false;
        continue;
      }
      if (previous.alive && previous.claimed && tank.__strategicAssetClaimed === true) continue;
      const context = stagingContext(state, sector.strategicSectorId, tank.team);
      if (context?.claimAsset?.('tanks', 1)) {
        tank.__strategicAssetClaimed = true;
        tank.__strategicAssetOrigin = context.to || null;
        continue;
      }
      tank.alive = false;
      tank.hp = 0;
      tank.flash = 0;
      tank.__strategicAssetClaimed = false;
      tank.replacementIn = Math.min(15, Math.max(1, Number(tank.replacementIn) || 15));
    }
  }
}

function strategicLogistics(state) {
  if(state?.serverStrategic?.logistics)return {snapshot:()=>state.serverStrategic.logistics};
  for (const sector of state?.sectors || []) {
    if (!sector?.strategicSectorId) continue;
    for (const team of ['ally', 'enemy']) {
      const context = stagingContext(state, sector.strategicSectorId, team);
      if (context?.strategicLogistics?.snapshot) return context.strategicLogistics;
    }
  }
  return null;
}

function convoyObservedLocally(state, convoy) {
  if (!finitePoint(state?.robot) || !finitePoint(convoy?.position)) return false;
  if (Math.hypot(convoy.position.x - state.robot.x, convoy.position.y - state.robot.y) <= 950) return true;
  const target = state.intel?.target;
  if (!target) return false;
  if (target.id && target.id === convoy.id) return true;
  return finitePoint(target) && Math.hypot(convoy.position.x - target.x, convoy.position.y - target.y) <= 850;
}

function distanceToSegment(point, from, to) {
  if (!finitePoint(point) || !finitePoint(from) || !finitePoint(to)) return Infinity;
  const dx = to.x - from.x, dy = to.y - from.y, lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-6) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq));
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
}

function localStrategicRoads(snapshot, playerPosition) {
  const nodes = new Map((snapshot?.nodes || []).filter(finitePoint).map(node => [node.id, node]));
  return (snapshot?.routes || []).flatMap(route => {
    const from = nodes.get(route.from), to = nodes.get(route.to);
    if (!from || !to || distanceToSegment(playerPosition, from, to) > LOCAL_ROAD_RADIUS) return [];
    return [Object.freeze({
      id: route.id,
      from: Object.freeze({ x: from.x, y: from.y }),
      to: Object.freeze({ x: to.x, y: to.y }),
      laneOffset: Math.max(0, Number(route.laneOffset) || 0),
      open: route.open !== false,
    })];
  }).slice(0, 48);
}

function capitalVisualLevel(structures = []) {
  if (structures.includes('factory') || structures.includes('armorWorks')) return 4;
  if (structures.includes('garage')) return 3;
  if (structures.includes('depot') || structures.includes('bunker') || structures.includes('mortar')) return 2;
  return 1;
}

function stripStrategicCapitalVisuals(state) {
  for (const sector of state?.sectors || []) {
    if (!Array.isArray(sector?.war?.bases)) continue;
    sector.war.bases = sector.war.bases.filter(base => base?.__strategicCapitalVisual !== true);
  }
  if (state?.warSimulation) state.warSimulation.strategicCapitals = [];
}

function publishStrategicCapitals(state, snapshot) {
  const strategicMap = globalThis.ironRainStrategicMap;
  if (!finitePoint(state?.robot) || typeof strategicMap?.locate !== 'function') return [];
  const capitals = [];
  for (const node of snapshot?.nodes || []) {
    if (!finitePoint(node) || Math.hypot(node.x - state.robot.x, node.y - state.robot.y) > LOCAL_CAPITAL_RADIUS) continue;
    const located = strategicMap.locate(node);
    const sector = located?.sector;
    if (!sector || Math.hypot(sector.x - node.x, sector.y - node.y) > 100) continue;
    const structures = Array.isArray(sector.structures) ? [...sector.structures] : [];
    capitals.push(Object.freeze({
      id: `strategic-capital:${node.id}`,
      strategicSectorId: node.id,
      x: node.x,
      y: node.y,
      team: node.team || null,
      alive: node.alive !== false,
      hp: node.alive === false ? 0 : 100,
      maxHp: 100,
      level: capitalVisualLevel(structures),
      structures: Object.freeze(structures),
      known: true,
      __strategicCapitalVisual: true,
    }));
  }
  // Render projections are immutable. The capital renderer consumes this list
  // directly; mixing it into tactical bases breaks supply/damage updates.
  return capitals;
}

function publishStrategicTraffic(state) {
  state.warSimulation ||= {};
  const now = Number(state.time) || 0;
  if (now < (state.warSimulation.nextTrafficProjection || 0)) return;
  state.warSimulation.nextTrafficProjection = now + .1;
  stripStrategicCapitalVisuals(state);
  const logistics = strategicLogistics(state);
  if (!logistics) { state.warSimulation.strategicTraffic = []; state.warSimulation.strategicRoads = []; state.warSimulation.strategicCapitals = []; return; }
  const snapshot = logistics.snapshot();
  state.warSimulation.strategicRoads = localStrategicRoads(snapshot, state.robot);
  state.warSimulation.strategicCapitals = publishStrategicCapitals(state, snapshot);
  const own = playerTeam();
  const observedEnemyIds = (snapshot.convoys || [])
    .filter(convoy => convoy?.team !== own && convoyObservedLocally(state, convoy))
    .map(convoy => convoy.id);
  const materialized = localConvoyMaterializationFeed({
    playerPosition: state.robot,
    playerTeam: own,
    convoys: snapshot.convoys || [],
    observedEnemyIds,
    localRadius: 9_000,
  });
  state.warSimulation.strategicTraffic = materialized.slice(0, 40).map(convoy => Object.freeze({
    id: convoy.id,
    kind: convoy.kind || 'supply',
    team: convoy.team,
    x: convoy.position.x,
    y: convoy.position.y,
    angle: Number(convoy.position.heading) || 0,
    speed: convoy.status === 'moving' ? Number(convoy.speed) || 1 : 0,
    moving: convoy.status === 'moving',
    blocked: convoy.status === 'blocked',
    known: convoy.team === own || observedEnemyIds.includes(convoy.id),
    cargo: Object.freeze({ ...(convoy.cargo || {}) }),
    assets: Object.freeze({ ...(convoy.assets || {}) }),
    hp: Number(convoy.hp) || 100,
    maxHp: 100,
    alive: true,
  }));
}

function routeInsideFriendly(from, to, team) {
  if (!finitePoint(from) || !finitePoint(to)) return false;
  for (let index = 0; index <= 8; index++) { const t = index / 8, point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }; if (strategicOwnerAt(point) !== team) return false; }
  return true;
}

function publishWorldBridge(state) {
  if (!isLiveGameState(state) || !state?.robot) return;
  const location = locateStrategic(state.robot);
  const fronts = (state.sectors || []).map(sec => { const center = sec.war ? getFrontGeometry(sec).center : sec; return { id: sec.id, name: sec.name, strategicHexId: sec.strategicHexId || null, strategicSectorId: sec.strategicSectorId || null, x: center.x, y: center.y, status: sec.status || 'stalemate', progress: Number(sec.progress) || 0, allyStrength: Number(sec.allyStrength) || 0, enemyStrength: Number(sec.enemyStrength) || 0 }; });
  globalThis.ironRainWarBridge = { version: 4, position: { x: state.robot.x, y: state.robot.y }, location, playerTeam: playerTeam(), safeRear: Boolean(location && location.owner === playerTeam() && location.distanceToFront > 5_250), spawn: state.warSimulation?.spawnApplied || null, fronts };
}

function dispatchHullState(state, armorBefore) {
  const armorAfter = Number(state?.robot?.armor);
  if (!Number.isFinite(armorBefore) || !Number.isFinite(armorAfter)) return;
  const damage = Math.max(0, armorBefore - armorAfter);
  if (damage > 0) {
    try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:mamute-impact', { detail: { damage, armor: armorAfter, intensity: Math.min(1, .25 + damage / 18), critical: armorAfter > 0 && armorAfter <= 30 } })); } catch {}
  }
  state.warSimulation ||= {};
  if (armorAfter <= 0 && !state.warSimulation.destroyedNotified) {
    state.warSimulation.destroyedNotified = true;
    try { globalThis.dispatchEvent?.(new CustomEvent('ironrain:mamute-destroyed', { detail: { position: { x: state.robot.x, y: state.robot.y }, spawn: state.warSimulation.spawnApplied || null } })); } catch {}
  } else if (armorAfter > 0) state.warSimulation.destroyedNotified = false;
}

export function updateWar(state, dt) {
  if(globalThis.ironRainEntry?.runtime?.isAuthoritativeClient){publishStrategicTraffic(state);publishWorldBridge(state);return;}
  const live = isLiveGameState(state);
  if (live) { ensureStrategicAlignment(state); ensureChosenSpawn(state); refreshCombatReserveContext(state); syncCombatSustainment(state); }
  const originalMode = state?.mode, team = playerTeam(), rearSafe = Boolean(live && state?.robot && strategicOwnerAt(state.robot) === team && frontDistance(state.robot) > 5_250), armorBefore = Number(state?.robot?.armor);
  const strategicBefore = live ? strategicAssetSnapshot(state) : null;
  if (rearSafe && originalMode === 'march') state.mode = 'strategic-rear';
  try { coreUpdateWar(state, dt); }
  finally {
    if (rearSafe && state) state.mode = originalMode;
    if (live) {
      reconcileStrategicAssets(state, strategicBefore);
      publishStrategicTraffic(state);
      dispatchHullState(state, armorBefore);
      publishWorldBridge(state);
    }
  }
}

export function assessRoute(state, from, to) {
  if (!isLiveGameState(state)) return coreAssessRoute(state, from, to);
  ensureStrategicAlignment(state);
  const team = playerTeam();
  if (routeInsideFriendly(from, to, team)) return { safe: true, risk: .06, reasons: ['Corredor dentro de território amigo confirmado pelo mapa estratégico.'], checkpoints: [{ ...from, status: 'secured', risk: .06 }, { ...to, status: 'secured', risk: .06 }], gaps: [], partisanRisk: 0, strategicSafe: true };
  return coreAssessRoute(state, from, to);
}

export function checkRouteAmbush(state, route, dt = 4) { if (route?.strategicSafe) return null; return coreCheckRouteAmbush(state, route, dt); }
