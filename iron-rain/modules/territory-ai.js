import { DEVELOPMENT_PROJECTS, VEHICLE_RECIPES, canStartProject, canStartVehicleProduction } from './territory-development.js';

const has = (node, type) => Array.isArray(node?.structures) && node.structures.includes(type);
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const missing = (node, type) => !has(node, type) && node?.activeProject !== type;

function projectPrerequisitesReady(node, type) {
  const project = DEVELOPMENT_PROJECTS[type];
  return Boolean(project && node?.securedFor >= project.secureFor && project.requires.every(required => has(node, required)));
}

function buildPreference(node, context = {}) {
  const pressure = clamp01(context.frontPressure);
  const routeThreat = clamp01(context.routeThreat);
  const armorThreat = clamp01(context.armorThreat);
  const infantryThreat = clamp01(context.infantryThreat);
  const airThreat = clamp01(context.airThreat);
  const armorDemand = clamp01(context.armorDemand ?? context.friendlyArmorDeficit);
  const logisticsNeed = clamp01(context.logisticsNeed ?? context.logisticsDeficit);
  const safe = pressure < .38 && routeThreat < .42;
  const list = [];
  const add = (type, reason) => { if (missing(node, type) && !list.some(item => item.type === type)) list.push({ type, reason }); };

  add('outpost', 'capital-bootstrap');
  if (pressure > .52 || routeThreat > .52) {
    add('barbedWire', 'front-pressure');
    add('wall', 'front-pressure');
    add('pillbox', infantryThreat > .45 ? 'infantry-threat' : 'route-defense');
    add('bunker', 'front-pressure');
    if (infantryThreat > .42) add('mortar', 'infantry-threat');
  }
  if (armorThreat > .5) add('fixedCannon', 'armor-threat');
  if (airThreat > .45) add('antiAir', 'air-threat');

  add('depot', logisticsNeed > .45 ? 'logistics-need' : 'development');
  add('resourceWarehouse', safe ? 'resource-buffer' : 'development');
  add('ammoDepot', pressure > .3 ? 'ammo-support' : 'development');
  add('infirmary', pressure > .35 ? 'recovery-support' : 'development');
  add('vehicleDepot', logisticsNeed > .35 || armorDemand > .35 ? 'vehicle-logistics' : 'development');
  add('garage', armorThreat > .35 || logisticsNeed > .3 ? 'repair-logistics' : 'development');

  if (infantryThreat > .58 || pressure > .65) add('heavyMortar', 'heavy-infantry-pressure');
  if (pressure > .64 || routeThreat > .62) add('fieldArtillery', 'front-fire-support');
  if (airThreat > .25 || node.securedFor > DEVELOPMENT_PROJECTS.antiAir.secureFor * 1.4) add('antiAir', airThreat > .25 ? 'air-threat' : 'mature-capital-air-defense');

  if (safe) {
    add('factory', 'secure-industrial-development');
    if (armorDemand > .35 || armorThreat > .45) add('armorWorks', 'armor-production-demand');
  }

  for (const type of ['pillbox','bunker','mortar','barbedWire','wall','resourceWarehouse','infirmary','ammoDepot','vehicleDepot','garage','heavyMortar','fieldArtillery','fixedCannon','antiAir','factory','armorWorks']) add(type, 'development');
  return list;
}

/**
 * Shared allied/enemy planner. It may choose a project that still needs a
 * physical delivery, but never bypasses security time or prerequisites.
 */
export function planTerritoryProject(node, context = {}) {
  if (!node?.owner || node.contested || node.activeProject || context.routeOpen === false || node.core?.status === 'neutralized') return null;
  for (const candidate of buildPreference(node, context)) {
    if (!projectPrerequisitesReady(node, candidate.type)) continue;
    return Object.freeze(candidate);
  }
  return null;
}

/** Only returns a project that territory-development can start right now. */
export function chooseTerritoryProject(node, context = {}) {
  if (!node?.owner || node.contested || node.activeProject || context.routeOpen === false) return null;
  for (const candidate of buildPreference(node, context)) {
    if (!projectPrerequisitesReady(node, candidate.type)) continue;
    if (canStartProject(node, candidate.type).ok) return Object.freeze(candidate);
  }
  return null;
}

/** Cargo/asset deficit for a project. Heavy emplacements request exactly one real kit. */
export function projectSupplyRequest(node, type) {
  const project = DEVELOPMENT_PROJECTS[type];
  if (!project || !node) return null;
  const cargo = {};
  let totalCargo = 0;
  for (const key of ['materials', 'ammo', 'fuel']) {
    cargo[key] = Math.max(0, (project.cost[key] || 0) - (node.stock?.[key] || 0));
    totalCargo += cargo[key];
  }
  const assets = {};
  if (project.kit && (node.assets?.[project.kit] || 0) < 1) assets[project.kit] = 1;
  const totalAssets = Object.values(assets).reduce((sum, value) => sum + value, 0);
  if (!totalCargo && !totalAssets) return null;
  return Object.freeze({
    team: node.owner,
    destination: node.id,
    project: type,
    cargo: Object.freeze(cargo),
    assets: Object.freeze(assets),
  });
}

export function chooseVehicleProduction(node, context = {}) {
  if (!node?.owner || node.contested || node.vehicleProduction || context.routeOpen === false) return null;
  const frontPressure = clamp01(context.frontPressure);
  const logisticsDeficit = clamp01(context.logisticsDeficit ?? context.truckDeficit);
  const reinforcementNeed = clamp01(context.reinforcementNeed);
  const armorDemand = clamp01(context.armorDemand ?? context.friendlyArmorDeficit);
  const armorThreat = clamp01(context.armorThreat);
  const trucks = Math.max(0, Number(node.assets?.trucks) || 0);
  const tanks = Math.max(0, Number(node.assets?.tanks) || 0);
  const wantsTruck = trucks < 2 || logisticsDeficit > .45 || reinforcementNeed > .55;
  if (wantsTruck) {
    const check = canStartVehicleProduction(node, 'truck');
    if (check.ok) return Object.freeze({ type: 'truck', reason: trucks < 2 ? 'minimum-logistics-fleet' : reinforcementNeed > .55 ? 'reinforcement-transport' : 'logistics-deficit' });
  }
  const wantsTank = tanks < 1 || armorDemand > .45 || armorThreat > .65 || frontPressure > .72;
  if (wantsTank) {
    const check = canStartVehicleProduction(node, 'tank');
    if (check.ok) return Object.freeze({ type: 'tank', reason: tanks < 1 ? 'minimum-armor-reserve' : armorThreat > .65 ? 'armor-threat' : 'front-armor-demand' });
  }
  return null;
}

export function vehicleSupplyRequest(node, type) {
  const recipe = VEHICLE_RECIPES[type];
  if (!node || !recipe) return null;
  const cargo = {};
  let total = 0;
  for (const key of ['materials', 'ammo', 'fuel']) {
    cargo[key] = Math.max(0, (recipe.cost[key] || 0) - (node.stock?.[key] || 0));
    total += cargo[key];
  }
  return total > 0 ? Object.freeze({ team: node.owner, destination: node.id, vehicle: type, cargo: Object.freeze(cargo) }) : null;
}

/** Effects exposed only after structures really exist. */
export function territoryOperationalEffects(node) {
  const structures = new Set(node?.structures || []);
  const defensiveCover = (structures.has('outpost') ? .08 : 0)
    + (structures.has('pillbox') ? .12 : 0)
    + (structures.has('bunker') ? .24 : 0)
    + (structures.has('wall') ? .10 : 0)
    + (structures.has('barbedWire') ? .06 : 0);
  return Object.freeze({
    supplyCapacity: 1 + (structures.has('depot') ? .45 : 0) + (structures.has('resourceWarehouse') ? .35 : 0) + (structures.has('vehicleDepot') ? .18 : 0) + (structures.has('factory') ? .35 : 0),
    defensiveCover,
    indirectFire: (structures.has('mortar') ? .18 : 0) + (structures.has('heavyMortar') ? .28 : 0) + (structures.has('fieldArtillery') ? .42 : 0),
    repairSupport: (structures.has('garage') ? .28 : 0) + (structures.has('vehicleDepot') ? .08 : 0),
    recoverySupport: structures.has('infirmary') ? .30 : 0,
    ammoSupport: structures.has('ammoDepot') ? .36 : 0,
    antiArmor: structures.has('fixedCannon') ? .36 : 0,
    airDefense: structures.has('antiAir') ? .38 : 0,
    armorStaging: structures.has('garage') || structures.has('vehicleDepot'),
    localProduction: structures.has('factory'),
    reinforcementSupport: (structures.has('outpost') ? .05 : 0) + (structures.has('depot') ? .12 : 0) + (structures.has('garage') ? .08 : 0) + (structures.has('infirmary') ? .12 : 0),
  });
}
