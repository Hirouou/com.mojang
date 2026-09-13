const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const copyStock = stock => ({
  materials: Math.max(0, Number(stock?.materials) || 0),
  ammo: Math.max(0, Number(stock?.ammo) || 0),
  fuel: Math.max(0, Number(stock?.fuel) || 0),
});
const copyAssets = assets => ({
  trucks: Math.max(0, Math.floor(Number(assets?.trucks) || 0)),
  tanks: Math.max(0, Math.floor(Number(assets?.tanks) || 0)),
  troops: Math.max(0, Math.floor(Number(assets?.troops) || 0)),
});
const controlRevision = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export const DEVELOPMENT_PROJECTS = Object.freeze({
  outpost: Object.freeze({ secureFor: 45, buildTime: 35, cost: Object.freeze({ materials: 35, ammo: 0, fuel: 0 }), requires: Object.freeze([]) }),
  depot: Object.freeze({ secureFor: 120, buildTime: 70, cost: Object.freeze({ materials: 90, ammo: 0, fuel: 10 }), requires: Object.freeze(['outpost']) }),
  mortar: Object.freeze({ secureFor: 180, buildTime: 55, cost: Object.freeze({ materials: 65, ammo: 24, fuel: 0 }), requires: Object.freeze(['outpost']) }),
  bunker: Object.freeze({ secureFor: 240, buildTime: 95, cost: Object.freeze({ materials: 125, ammo: 0, fuel: 0 }), requires: Object.freeze(['outpost']) }),
  garage: Object.freeze({ secureFor: 360, buildTime: 130, cost: Object.freeze({ materials: 185, ammo: 0, fuel: 45 }), requires: Object.freeze(['depot']) }),
  factory: Object.freeze({ secureFor: 900, buildTime: 260, cost: Object.freeze({ materials: 440, ammo: 30, fuel: 125 }), requires: Object.freeze(['depot', 'garage']) }),
  armorWorks: Object.freeze({ secureFor: 1_200, buildTime: 340, cost: Object.freeze({ materials: 520, ammo: 40, fuel: 160 }), requires: Object.freeze(['garage', 'factory']) }),
});

export const VEHICLE_RECIPES = Object.freeze({
  truck: Object.freeze({ buildTime: 45, cost: Object.freeze({ materials: 55, ammo: 0, fuel: 18 }), requires: Object.freeze(['garage']), output: 'trucks' }),
  tank: Object.freeze({ buildTime: 135, cost: Object.freeze({ materials: 190, ammo: 36, fuel: 72 }), requires: Object.freeze(['armorWorks']), output: 'tanks' }),
});

export function createTerritoryNode({ id, owner = null, revision = null, stock = {}, assets = {} } = {}) {
  return {
    id: String(id ?? ''),
    owner: owner === 'ally' || owner === 'enemy' ? owner : null,
    contested: true,
    securedFor: 0,
    stock: copyStock(stock),
    assets: copyAssets(assets),
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
  return node;
}

export function receiveTerritoryDelivery(node, delivery) {
  if (!node || node.contested || !node.owner || delivery?.team !== node.owner) return false;
  const cargo = copyStock(delivery?.cargo), assets = copyAssets(delivery?.assets);
  node.stock.materials += cargo.materials;
  node.stock.ammo += cargo.ammo;
  node.stock.fuel += cargo.fuel;
  node.assets.trucks += assets.trucks;
  node.assets.tanks += assets.tanks;
  node.assets.troops += assets.troops;
  node.deliveriesReceived += 1;
  node.lastEvent = 'delivery-arrived';
  return true;
}

function canPay(stock, cost) {
  return ['materials', 'ammo', 'fuel'].every(key => (stock[key] || 0) >= (cost[key] || 0));
}
function pay(stock, cost) {
  for (const key of ['materials', 'ammo', 'fuel']) stock[key] = Math.max(0, stock[key] - (cost[key] || 0));
}

export function canStartProject(node, type) {
  const project = DEVELOPMENT_PROJECTS[type];
  if (!node || !project) return Object.freeze({ ok: false, reason: 'unknown-project' });
  if (!node.owner || node.contested) return Object.freeze({ ok: false, reason: 'territory-not-secure' });
  if (node.activeProject) return Object.freeze({ ok: false, reason: 'busy' });
  if (node.structures.includes(type)) return Object.freeze({ ok: false, reason: 'already-built' });
  if (node.securedFor < project.secureFor) return Object.freeze({ ok: false, reason: 'not-secured-long-enough', remaining: project.secureFor - node.securedFor });
  if (!project.requires.every(required => node.structures.includes(required))) return Object.freeze({ ok: false, reason: 'missing-prerequisite' });
  if (!canPay(node.stock, project.cost)) return Object.freeze({ ok: false, reason: 'materials-not-delivered' });
  return Object.freeze({ ok: true, reason: 'ready' });
}

export function startTerritoryProject(node, type) {
  const check = canStartProject(node, type);
  if (!check.ok) return check;
  const project = DEVELOPMENT_PROJECTS[type];
  pay(node.stock, project.cost);
  node.activeProject = type;
  node.projectProgress = 0;
  node.lastEvent = `building:${type}`;
  return Object.freeze({ ok: true, type, buildTime: project.buildTime });
}

export function canStartVehicleProduction(node, type) {
  const recipe = VEHICLE_RECIPES[type];
  if (!node || !recipe) return Object.freeze({ ok: false, reason: 'unknown-vehicle' });
  if (!node.owner || node.contested) return Object.freeze({ ok: false, reason: 'territory-not-secure' });
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
  if (node.activeProject && routeOpen) {
    const project = DEVELOPMENT_PROJECTS[node.activeProject];
    node.projectProgress += elapsed;
    if (node.projectProgress >= project.buildTime) {
      built = node.activeProject;
      node.structures.push(built);
      node.activeProject = null;
      node.projectProgress = 0;
      node.lastEvent = `built:${built}`;
    }
  }

  // Factories do not conjure structures at the front. They only manufacture
  // transferable material. A convoy still has to carry that stock elsewhere.
  let produced = 0;
  if (routeOpen && node.structures.includes('factory')) {
    node.productionRemainder += elapsed * .12; // 7.2 material units / minute at current simulation scale.
    produced = Math.floor(node.productionRemainder);
    if (produced > 0) {
      node.productionRemainder -= produced;
      node.stock.materials += produced;
    }
  }

  // Vehicle construction consumes its full local stock cost when the order starts.
  // A route cut prevents future deliveries but does not delete materials already
  // inside the capital. The finished vehicle stays at this node until logistics
  // dispatches it physically toward staging/front.
  let vehicleBuilt = null;
  if (node.vehicleProduction) {
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

  return Object.freeze({ built, produced, vehicleBuilt, paused: Boolean(node.activeProject && !routeOpen) });
}

export function territorySnapshot(node) {
  return Object.freeze({
    id: node.id,
    owner: node.owner,
    contested: node.contested,
    securedFor: node.securedFor,
    stock: Object.freeze(copyStock(node.stock)),
    assets: Object.freeze(copyAssets(node.assets)),
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
    id: String(id ?? ''),
    team: team === 'ally' || team === 'enemy' ? team : null,
    from: String(from ?? ''),
    to: String(to ?? ''),
    cargo: copyStock(cargo),
    assets: copyAssets(assets),
    distance: Math.max(1, Number(distance) || 1_000),
    speed: Math.max(.1, Number(speed) || 14),
    travelled: 0,
    hp: 100,
    status: 'moving',
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
