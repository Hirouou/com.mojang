import { CAPITAL_HEAVY_KIT_KEYS, buildCapitalLayout, heavyKitForProject, nearestCapitalFacility } from './capital-city-layout.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const RESOURCE_KEYS = Object.freeze(['materials', 'ammo', 'fuel']);
export const TERRITORY_ASSET_KEYS = Object.freeze(['trucks', 'tanks', 'troops', ...CAPITAL_HEAVY_KIT_KEYS]);
const copyStock = stock => Object.fromEntries(RESOURCE_KEYS.map(key => [key, Math.max(0, Number(stock?.[key]) || 0)]));
const copyAssets = assets => {
  const out = Object.fromEntries(['trucks', 'tanks', 'troops'].map(key => [key, Math.max(0, Math.floor(Number(assets?.[key]) || 0))]));
  for (const key of CAPITAL_HEAVY_KIT_KEYS) { const amount = Math.max(0, Math.floor(Number(assets?.[key]) || 0)); if (amount > 0 || Object.prototype.hasOwnProperty.call(assets || {}, key)) out[key] = amount; }
  return out;
};
const controlRevision = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const CAPITAL_CORE_MAX_HP = 1_000;

export function capitalCoreStatus(hp, maxHp = CAPITAL_CORE_MAX_HP) {
  const cap = Math.max(1, Number(maxHp) || CAPITAL_CORE_MAX_HP);
  const value = clamp(Number(hp) || 0, 0, cap);
  if (value <= 0) return 'neutralized';
  return value / cap < .55 ? 'damaged' : 'intact';
}

function copyCore(core = {}) {
  const maxHp = Math.max(1, Number(core.maxHp) || CAPITAL_CORE_MAX_HP);
  const hp = clamp(core.hp === undefined ? maxHp : Number(core.hp), 0, maxHp);
  return { hp, maxHp, status: capitalCoreStatus(hp, maxHp) };
}

const project = (secureFor, buildTime, cost, requires = [], kit = null) => Object.freeze({
  secureFor,
  buildTime,
  cost: Object.freeze({ materials: 0, ammo: 0, fuel: 0, ...cost }),
  requires: Object.freeze([...requires]),
  kit,
});

export const DEVELOPMENT_PROJECTS = Object.freeze({
  outpost: project(45, 35, { materials: 35 }),
  depot: project(120, 70, { materials: 90, fuel: 10 }, ['outpost']),
  resourceWarehouse: project(165, 80, { materials: 105, fuel: 8 }, ['outpost']),
  vehicleDepot: project(250, 105, { materials: 150, fuel: 26 }, ['depot']),
  infirmary: project(210, 85, { materials: 100, ammo: 4, fuel: 8 }, ['outpost']),
  ammoDepot: project(220, 95, { materials: 120, ammo: 18, fuel: 8 }, ['depot']),
  mortar: project(180, 55, { materials: 65, ammo: 24 }, ['outpost']),
  pillbox: project(165, 52, { materials: 58, ammo: 8 }, ['outpost']),
  bunker: project(240, 95, { materials: 125 }, ['outpost']),
  wall: project(150, 42, { materials: 52 }, ['outpost']),
  barbedWire: project(120, 28, { materials: 22 }, ['outpost']),
  heavyMortar: project(300, 110, { materials: 115, ammo: 42, fuel: 5 }, ['depot', 'mortar'], heavyKitForProject('heavyMortar')),
  fieldArtillery: project(420, 150, { materials: 175, ammo: 62, fuel: 18 }, ['depot'], heavyKitForProject('fieldArtillery')),
  fixedCannon: project(360, 125, { materials: 145, ammo: 46, fuel: 10 }, ['outpost'], heavyKitForProject('fixedCannon')),
  antiAir: project(480, 145, { materials: 180, ammo: 58, fuel: 22 }, ['depot'], heavyKitForProject('antiAir')),
  garage: project(360, 130, { materials: 185, fuel: 45 }, ['depot']),
  factory: project(900, 260, { materials: 440, ammo: 30, fuel: 125 }, ['depot', 'garage']),
  armorWorks: project(1_200, 340, { materials: 520, ammo: 40, fuel: 160 }, ['garage', 'factory']),
});

export const VEHICLE_RECIPES = Object.freeze({
  truck: Object.freeze({ buildTime: 45, cost: Object.freeze({ materials: 55, ammo: 0, fuel: 18 }), requires: Object.freeze(['garage']), output: 'trucks' }),
  tank: Object.freeze({ buildTime: 135, cost: Object.freeze({ materials: 190, ammo: 36, fuel: 72 }), requires: Object.freeze(['armorWorks']), output: 'tanks' }),
});

export function createTerritoryNode({ id, owner = null, revision = null, stock = {}, assets = {}, core = {} } = {}) {
  return {
    id: String(id ?? ''),
    owner: owner === 'ally' || owner === 'enemy' ? owner : null,
    contested: true,
    securedFor: 0,
    stock: copyStock(stock),
    assets: copyAssets(assets),
    core: copyCore(core),
    structures: [],
    activeProject: null,
    projectProgress: 0,
    vehicleProduction: null,
    vehicleProductionProgress: 0,
    productionRemainder: 0,
    deliveriesReceived: 0,
    lastEvent: 'unsecured',
    controlRevision: controlRevision(revision),
  };
}

export function damageCapitalCore(node, damage = 0) {
  if (!node?.core) return Object.freeze({ ok: false, reason: 'missing-capital-core' });
  const amount = Math.max(0, Number(damage) || 0);
  node.core.hp = clamp(node.core.hp - amount, 0, node.core.maxHp);
  node.core.status = capitalCoreStatus(node.core.hp, node.core.maxHp);
  node.lastEvent = amount > 0 ? `capital-core:${node.core.status}` : node.lastEvent;
  return Object.freeze({ ok: true, hp: node.core.hp, maxHp: node.core.maxHp, status: node.core.status, owner: node.owner });
}

export function setTerritoryControl(node, owner, { contested = false, dt = 0 } = {}) {
  if (!node) return node;
  const nextOwner = owner === 'ally' || owner === 'enemy' ? owner : null;
  if (node.owner !== nextOwner) {
    node.owner = nextOwner;
    node.securedFor = 0;
    node.activeProject = null;
    node.projectProgress = 0;
    node.vehicleProduction = null;
    node.vehicleProductionProgress = 0;
    node.lastEvent = nextOwner ? `captured:${nextOwner}` : 'neutralized';
  }
  node.contested = Boolean(contested || !nextOwner);
  if (!node.contested && nextOwner) node.securedFor += clamp(dt, 0, 3600);
  if (node.core) node.core.status = capitalCoreStatus(node.core.hp, node.core.maxHp);
  return node;
}

export function receiveTerritoryDelivery(node, delivery) {
  if (!node || node.contested || !node.owner || delivery?.team !== node.owner) return false;
  const cargo = copyStock(delivery?.cargo), assets = copyAssets(delivery?.assets);
  for (const key of RESOURCE_KEYS) node.stock[key] += cargo[key];
  for (const key of TERRITORY_ASSET_KEYS) { const amount = assets[key] || 0; if (amount > 0) node.assets[key] = (node.assets[key] || 0) + amount; }
  node.deliveriesReceived += 1;
  node.lastEvent = 'delivery-arrived';
  return true;
}

function canPay(stock, cost) { return RESOURCE_KEYS.every(key => (stock[key] || 0) >= (cost[key] || 0)); }
function pay(stock, cost) { for (const key of RESOURCE_KEYS) stock[key] = Math.max(0, stock[key] - (cost[key] || 0)); }

export function canStartProject(node, type) {
  const definition = DEVELOPMENT_PROJECTS[type];
  if (!node || !definition) return Object.freeze({ ok: false, reason: 'unknown-project' });
  if (!node.owner || node.contested) return Object.freeze({ ok: false, reason: 'territory-not-secure' });
  if (node.core?.status === 'neutralized') return Object.freeze({ ok: false, reason: 'capital-core-neutralized' });
  if (node.activeProject) return Object.freeze({ ok: false, reason: 'busy' });
  if (node.structures.includes(type)) return Object.freeze({ ok: false, reason: 'already-built' });
  if (node.securedFor < definition.secureFor) return Object.freeze({ ok: false, reason: 'not-secured-long-enough', remaining: definition.secureFor - node.securedFor });
  if (!definition.requires.every(required => node.structures.includes(required))) return Object.freeze({ ok: false, reason: 'missing-prerequisite' });
  if (!canPay(node.stock, definition.cost)) return Object.freeze({ ok: false, reason: 'materials-not-delivered' });
  if (definition.kit && (node.assets?.[definition.kit] || 0) < 1) return Object.freeze({ ok: false, reason: 'heavy-kit-not-delivered', kit: definition.kit });
  return Object.freeze({ ok: true, reason: 'ready', kit: definition.kit || null });
}

export function startTerritoryProject(node, type) {
  const check = canStartProject(node, type);
  if (!check.ok) return check;
  const definition = DEVELOPMENT_PROJECTS[type];
  pay(node.stock, definition.cost);
  if (definition.kit) node.assets[definition.kit] = Math.max(0, (node.assets[definition.kit] || 0) - 1);
  node.activeProject = type;
  node.projectProgress = 0;
  node.lastEvent = `building:${type}`;
  return Object.freeze({ ok: true, type, buildTime: definition.buildTime, consumedKit: definition.kit || null });
}

export function canStartVehicleProduction(node, type) {
  const recipe = VEHICLE_RECIPES[type];
  if (!node || !recipe) return Object.freeze({ ok: false, reason: 'unknown-vehicle' });
  if (!node.owner || node.contested) return Object.freeze({ ok: false, reason: 'territory-not-secure' });
  if (node.core?.status === 'neutralized') return Object.freeze({ ok: false, reason: 'capital-core-neutralized' });
  if (node.vehicleProduction) return Object.freeze({ ok: false, reason: 'production-busy' });
  if (!recipe.requires.every(required => node.structures.includes(required))) return Object.freeze({ ok: false, reason: 'missing-production-facility' });
  if (!canPay(node.stock, recipe.cost)) return Object.freeze({ ok: false, reason: 'production-stock-insufficient' });
  return Object.freeze({ ok: true, reason: 'ready' });
}

export function startVehicleProduction(node, type) {
  const check = canStartVehicleProduction(node, type);
  if (!check.ok) return check;
  const recipe = VEHICLE_RECIPES[type];
  pay(node.stock, recipe.cost);
  node.vehicleProduction = type;
  node.vehicleProductionProgress = 0;
  node.lastEvent = `producing:${type}`;
  return Object.freeze({ ok: true, type, buildTime: recipe.buildTime });
}

/** Construction pauses when the sector is contested or its logistical route is cut. */
export function stepTerritoryDevelopment(node, dt, { routeOpen = true, contested = node?.contested } = {}) {
  if (!node) return null;
  const elapsed = clamp(dt, 0, 60);
  setTerritoryControl(node, node.owner, { contested, dt: elapsed });
  if (!node.owner || node.contested) return Object.freeze({ built: null, produced: 0, vehicleBuilt: null, paused: true });

  let built = null;
  if (node.activeProject && routeOpen && node.core?.status !== 'neutralized') {
    const definition = DEVELOPMENT_PROJECTS[node.activeProject];
    node.projectProgress += elapsed;
    if (node.projectProgress >= definition.buildTime) {
      built = node.activeProject;
      node.structures.push(built);
      node.activeProject = null;
      node.projectProgress = 0;
      node.lastEvent = `built:${built}`;
    }
  }

  let produced = 0;
  if (routeOpen && node.core?.status !== 'neutralized' && node.structures.includes('factory')) {
    node.productionRemainder += elapsed * .12;
    produced = Math.floor(node.productionRemainder);
    if (produced > 0) { node.productionRemainder -= produced; node.stock.materials += produced; }
  }

  let vehicleBuilt = null;
  if (node.vehicleProduction && node.core?.status !== 'neutralized') {
    const recipe = VEHICLE_RECIPES[node.vehicleProduction];
    node.vehicleProductionProgress += elapsed;
    if (node.vehicleProductionProgress >= recipe.buildTime) {
      vehicleBuilt = node.vehicleProduction;
      node.assets[recipe.output] = Math.max(0, (node.assets[recipe.output] || 0) + 1);
      node.vehicleProduction = null;
      node.vehicleProductionProgress = 0;
      node.lastEvent = `produced:${vehicleBuilt}`;
    }
  }

  return Object.freeze({ built, produced, vehicleBuilt, paused: Boolean((node.activeProject && !routeOpen) || node.core?.status === 'neutralized') });
}

export function consumeCapitalAmmo(node, amount = 1) {
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  if (!node?.owner || node.contested) return Object.freeze({ ok: false, reason: 'territory-not-secure', transferred: 0 });
  if (!node.structures?.includes('ammoDepot')) return Object.freeze({ ok: false, reason: 'ammo-depot-unavailable', transferred: 0 });
  const available = Math.max(0, Math.floor(Number(node.stock?.ammo) || 0));
  const transferred = Math.min(requested, available);
  if (transferred <= 0) return Object.freeze({ ok: false, reason: 'ammo-stock-empty', transferred: 0, remaining: available });
  node.stock.ammo = available - transferred;
  node.lastEvent = 'ammo-issued';
  return Object.freeze({ ok: true, reason: 'ammo-issued', transferred, remaining: node.stock.ammo });
}

/** Shared city-layout facility seam for combat/Mamute systems. */
export function queryCapitalFacility(node, { center, roadBearings = [], position, type = null, maxDistance = Infinity } = {}) {
  if (!node || !center || !position) return null;
  const layout = buildCapitalLayout({ id: node.id, x: center.x, y: center.y, roadBearings, structures: node.structures });
  const found = nearestCapitalFacility(layout, type, position, maxDistance);
  if (!found) return null;
  return Object.freeze({
    capitalId: node.id,
    owner: node.owner,
    contested: Boolean(node.contested),
    coreStatus: node.core?.status || 'neutralized',
    facility: found.facility,
    distance: found.distance,
    stock: Object.freeze(copyStock(node.stock)),
  });
}

export function territorySnapshot(node) {
  return Object.freeze({
    id: node.id,
    owner: node.owner,
    contested: node.contested,
    securedFor: node.securedFor,
    stock: Object.freeze(copyStock(node.stock)),
    assets: Object.freeze(copyAssets(node.assets)),
    core: Object.freeze(copyCore(node.core)),
    structures: Object.freeze([...node.structures]),
    activeProject: node.activeProject,
    projectProgress: node.projectProgress,
    vehicleProduction: node.vehicleProduction,
    vehicleProductionProgress: node.vehicleProductionProgress,
    deliveriesReceived: node.deliveriesReceived,
    lastEvent: node.lastEvent,
    controlRevision: controlRevision(node.controlRevision),
  });
}

export function createSupplyConvoy({ id, team, from, to, cargo, assets, distance = 1_000, speed = 14 } = {}) {
  return {
    id: String(id ?? ''), team: team === 'ally' || team === 'enemy' ? team : null,
    from: String(from ?? ''), to: String(to ?? ''), cargo: copyStock(cargo), assets: copyAssets(assets),
    distance: Math.max(1, Number(distance) || 1_000), speed: Math.max(.1, Number(speed) || 14), travelled: 0, hp: 100, status: 'moving',
  };
}

/** A cut road stops the truck. Destruction means the destination receives nothing. */
export function stepSupplyConvoy(convoy, dt, { routeOpen = true, incomingDamage = 0 } = {}) {
  if (!convoy || ['arrived', 'destroyed'].includes(convoy.status)) return convoy?.status || null;
  convoy.hp = clamp(convoy.hp - Math.max(0, Number(incomingDamage) || 0), 0, 100);
  if (convoy.hp <= 0) { convoy.status = 'destroyed'; return convoy.status; }
  if (!routeOpen) { convoy.status = 'blocked'; return convoy.status; }
  convoy.status = 'moving';
  convoy.travelled = Math.min(convoy.distance, convoy.travelled + convoy.speed * clamp(dt, 0, 60));
  if (convoy.travelled >= convoy.distance) convoy.status = 'arrived';
  return convoy.status;
}
