import { DEVELOPMENT_PROJECTS, VEHICLE_RECIPES, canStartProject, canStartVehicleProduction } from './territory-development.js';

const has = (node, type) => Array.isArray(node?.structures) && node.structures.includes(type);
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Strategic construction preference shared by allied/enemy AI. This planner
 * does not create resources or buildings; it only chooses what the faction
 * would LIKE to build. Territory-development still enforces security, delivery
 * stock, prerequisites and route availability.
 */
export function chooseTerritoryProject(node, context = {}) {
  if (!node?.owner || node.contested || node.activeProject || context.routeOpen === false) return null;
  const pressure = clamp01(context.frontPressure);
  const armorThreat = clamp01(context.armorThreat);
  const infantryThreat = clamp01(context.infantryThreat);
  const armorDemand = clamp01(context.armorDemand ?? context.friendlyArmorDeficit);
  const criticalInfrastructure = ['depot', 'garage', 'factory', 'armorWorks'].some(type => has(node, type));
  const protectCriticalInfrastructure = pressure > .42 && criticalInfrastructure && !has(node, 'bunker');

  const preference = [];
  if (!has(node, 'outpost')) preference.push('outpost');
  if (protectCriticalInfrastructure) preference.push('bunker');
  if (!has(node, 'depot')) preference.push('depot');
  if (pressure > .55 && !has(node, 'bunker') && !preference.includes('bunker')) preference.push('bunker');
  if (infantryThreat > .45 && !has(node, 'mortar')) preference.push('mortar');
  if ((armorThreat > .4 || node.securedFor > 520) && !has(node, 'garage')) preference.push('garage');
  if (node.securedFor > DEVELOPMENT_PROJECTS.factory.secureFor && !has(node, 'factory')) preference.push('factory');
  if ((armorDemand > .45 || armorThreat > .65) && has(node, 'garage') && has(node, 'factory') && !has(node, 'armorWorks')) preference.push('armorWorks');
  if (!preference.includes('mortar') && !has(node, 'mortar')) preference.push('mortar');
  if (!preference.includes('bunker') && !has(node, 'bunker')) preference.push('bunker');
  if (!preference.includes('garage') && !has(node, 'garage')) preference.push('garage');
  if (!preference.includes('factory') && !has(node, 'factory')) preference.push('factory');
  if (!preference.includes('armorWorks') && !has(node, 'armorWorks')) preference.push('armorWorks');

  for (const type of preference) {
    const check = canStartProject(node, type);
    if (check.ok) return Object.freeze({
      type,
      reason: type === 'bunker' && protectCriticalInfrastructure
        ? 'logistics-defense'
        : pressure > .55 && type === 'bunker'
          ? 'front-pressure'
          : infantryThreat > .45 && type === 'mortar'
            ? 'infantry-threat'
            : type === 'armorWorks'
              ? 'armor-production-demand'
              : 'development',
    });
  }
  return null;
}

/** Cargo request is the deficit for the chosen project; planners never mint it. */
export function projectSupplyRequest(node, type) {
  const project = DEVELOPMENT_PROJECTS[type];
  if (!project || !node) return null;
  const cargo = {};
  let total = 0;
  for (const key of ['materials', 'ammo', 'fuel']) {
    cargo[key] = Math.max(0, (project.cost[key] || 0) - (node.stock?.[key] || 0));
    total += cargo[key];
  }
  return total > 0 ? Object.freeze({ team: node.owner, destination: node.id, project: type, cargo: Object.freeze(cargo) }) : null;
}

/**
 * Shared vehicle-production doctrine. It never creates the vehicle: it only
 * chooses which finite production order should be attempted at this capital.
 * The same thresholds are used by both factions and the territory module still
 * enforces facility, stock and build-time requirements.
 */
export function chooseVehicleProduction(node, context = {}) {
  if (!node?.owner || node.contested || node.vehicleProduction || context.routeOpen === false) return null;
  const frontPressure = clamp01(context.frontPressure);
  const logisticsDeficit = clamp01(context.logisticsDeficit ?? context.truckDeficit);
  const reinforcementNeed = clamp01(context.reinforcementNeed);
  const armorDemand = clamp01(context.armorDemand ?? context.friendlyArmorDeficit);
  const armorThreat = clamp01(context.armorThreat);
  const trucks = Math.max(0, Number(node.assets?.trucks) || 0);
  const tanks = Math.max(0, Number(node.assets?.tanks) || 0);

  // Keep the logistics spine alive before spending the same scarce stock on armor.
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

/** Stock deficit for a desired vehicle order; stock still has to travel here. */
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

/** Effects exposed to combat AI after structures really exist. */
export function territoryOperationalEffects(node) {
  const structures = new Set(node?.structures || []);
  return Object.freeze({
    supplyCapacity: 1 + (structures.has('depot') ? .45 : 0) + (structures.has('factory') ? .35 : 0),
    defensiveCover: (structures.has('outpost') ? .08 : 0) + (structures.has('bunker') ? .24 : 0),
    indirectFire: structures.has('mortar') ? .2 : 0,
    repairSupport: structures.has('garage') ? .28 : 0,
    armorStaging: structures.has('garage'),
    localProduction: structures.has('factory'),
    reinforcementSupport: (structures.has('outpost') ? .05 : 0) + (structures.has('depot') ? .12 : 0) + (structures.has('garage') ? .08 : 0),
  });
}
