const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const stockKeys = Object.freeze(['materials', 'ammo', 'fuel']);
export const LOGISTICS_ASSET_KEYS = Object.freeze(['trucks', 'tanks', 'troops']);
const copyStock = value => Object.fromEntries(stockKeys.map(key => [key, Math.max(0, Number(value?.[key]) || 0)]));
const copyAssets = value => Object.fromEntries(LOGISTICS_ASSET_KEYS.map(key => [key, Math.max(0, Math.floor(Number(value?.[key]) || 0))]));

export function createLogisticsNode({ id, team, x = 0, y = 0, stock = {}, assets = {}, kind = 'outpost' } = {}) {
  return {
    id: String(id ?? ''),
    team: team === 'ally' || team === 'enemy' ? team : null,
    x: Number(x) || 0,
    y: Number(y) || 0,
    kind,
    alive: true,
    stock: copyStock(stock),
    assets: copyAssets(assets),
  };
}

export function createSupplyRoute({ id, team, from, to, distance = 1_000 } = {}) {
  return { id: String(id ?? `${from}-${to}`), team: team === 'ally' || team === 'enemy' ? team : null, from: String(from ?? ''), to: String(to ?? ''), distance: Math.max(1, Number(distance) || 1_000), open: true, threat: 0 };
}

function canPay(stock, cargo) { return stockKeys.every(key => (stock?.[key] || 0) >= (cargo?.[key] || 0)); }
function debit(stock, cargo) { for (const key of stockKeys) stock[key] = Math.max(0, stock[key] - (cargo[key] || 0)); }
function credit(stock, cargo) { for (const key of stockKeys) stock[key] = Math.max(0, stock[key] + (cargo[key] || 0)); }
function canPayAssets(assets, manifest) { return LOGISTICS_ASSET_KEYS.every(key => (assets?.[key] || 0) >= (manifest?.[key] || 0)); }
function debitAssets(assets, manifest) { for (const key of LOGISTICS_ASSET_KEYS) assets[key] = Math.max(0, (assets[key] || 0) - (manifest[key] || 0)); }
function creditAssets(assets, manifest) { for (const key of LOGISTICS_ASSET_KEYS) assets[key] = Math.max(0, (assets[key] || 0) + (manifest[key] || 0)); }

export function createStrategicLogistics({ nodes = [], routes = [] } = {}) {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const routeMap = new Map(routes.map(route => [route.id, route]));
  const convoys = new Map();
  let serial = 0;

  function adjacency(team) {
    const graph = new Map();
    for (const route of routeMap.values()) {
      if (!route.open || route.team !== team) continue;
      if (!nodeMap.get(route.from)?.alive || !nodeMap.get(route.to)?.alive) continue;
      if (!graph.has(route.from)) graph.set(route.from, []);
      if (!graph.has(route.to)) graph.set(route.to, []);
      graph.get(route.from).push({ node: route.to, route });
      graph.get(route.to).push({ node: route.from, route: { ...route, from: route.to, to: route.from } });
    }
    return graph;
  }

  function route(team, from, to) {
    if (from === to) return Object.freeze([]);
    const graph = adjacency(team), frontier = [{ id: from, distance: 0, path: [] }], best = new Map([[from, 0]]);
    while (frontier.length) {
      frontier.sort((a, b) => a.distance - b.distance);
      const current = frontier.shift();
      if (current.id === to) return Object.freeze(current.path.map(step => Object.freeze(step)));
      for (const edge of graph.get(current.id) || []) {
        const nextDistance = current.distance + edge.route.distance;
        if ((best.get(edge.node) ?? Infinity) <= nextDistance) continue;
        best.set(edge.node, nextDistance);
        frontier.push({ id: edge.node, distance: nextDistance, path: [...current.path, { routeId: edge.route.id, from: current.id, to: edge.node, distance: edge.route.distance }] });
      }
    }
    return null;
  }

  function dispatch({ team, from, to, cargo = {}, assets = {}, speed = 14, kind = 'supply' } = {}) {
    const origin = nodeMap.get(String(from)), destination = nodeMap.get(String(to));
    const load = copyStock(cargo), manifest = copyAssets(assets);
    if (!origin?.alive || !destination?.alive || origin.team !== team || destination.team !== team) return Object.freeze({ ok: false, reason: 'invalid-endpoint' });
    if (!canPay(origin.stock, load)) return Object.freeze({ ok: false, reason: 'origin-stock-insufficient' });
    if (!canPayAssets(origin.assets, manifest)) return Object.freeze({ ok: false, reason: 'origin-assets-insufficient' });
    const path = route(team, origin.id, destination.id);
    if (!path) return Object.freeze({ ok: false, reason: 'route-cut' });
    debit(origin.stock, load);
    debitAssets(origin.assets, manifest);
    const convoy = {
      id: `CV-${++serial}`,
      kind: String(kind || 'supply'),
      team,
      from: origin.id,
      to: destination.id,
      cargo: load,
      assets: manifest,
      path: [...path],
      leg: 0,
      legProgress: 0,
      speed: Math.max(.1, Number(speed) || 14),
      hp: 100,
      status: path.length ? 'moving' : 'arrived',
    };
    if (!path.length) {
      credit(destination.stock, load);
      creditAssets(destination.assets, manifest);
    } else convoys.set(convoy.id, convoy);
    return Object.freeze({ ok: true, convoyId: convoy.id, status: convoy.status });
  }

  function routeStillOpen(convoy) {
    const leg = convoy.path[convoy.leg];
    if (!leg) return true;
    const stored = routeMap.get(leg.routeId);
    return Boolean(stored?.open && stored.team === convoy.team);
  }

  function step(dt, { damageByConvoy = {} } = {}) {
    const elapsed = clamp(dt, 0, 60), events = [];
    for (const convoy of convoys.values()) {
      if (['arrived', 'destroyed'].includes(convoy.status)) continue;
      convoy.hp = clamp(convoy.hp - Math.max(0, Number(damageByConvoy[convoy.id]) || 0), 0, 100);
      if (convoy.hp <= 0) {
        convoy.status = 'destroyed';
        events.push({
          type: 'convoy-destroyed', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind,
          lostCargo: { ...convoy.cargo }, lostAssets: { ...convoy.assets },
        });
        continue;
      }
      if (!routeStillOpen(convoy)) { convoy.status = 'blocked'; continue; }
      convoy.status = 'moving';
      let travel = convoy.speed * elapsed;
      while (travel > 0 && convoy.leg < convoy.path.length) {
        const leg = convoy.path[convoy.leg], remaining = leg.distance - convoy.legProgress;
        const move = Math.min(travel, remaining);
        convoy.legProgress += move; travel -= move;
        if (convoy.legProgress >= leg.distance - 1e-6) { convoy.leg += 1; convoy.legProgress = 0; }
        if (convoy.leg < convoy.path.length && !routeStillOpen(convoy)) {
          convoy.status = 'blocked';
          break;
        }
      }
      if (convoy.leg >= convoy.path.length) {
        const destination = nodeMap.get(convoy.to);
        if (destination?.alive && destination.team === convoy.team) {
          credit(destination.stock, convoy.cargo);
          creditAssets(destination.assets, convoy.assets);
          convoy.status = 'arrived';
          events.push({
            type: 'convoy-arrived', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind,
            cargo: { ...convoy.cargo }, assets: { ...convoy.assets },
          });
        } else convoy.status = 'blocked';
      }
    }
    return Object.freeze(events.map(event => Object.freeze(event)));
  }

  function setRouteOpen(routeId, open, threat = null) {
    const item = routeMap.get(String(routeId));
    if (!item) return false;
    item.open = Boolean(open);
    if (Number.isFinite(threat)) item.threat = clamp(threat, 0, 1);
    return true;
  }

  function snapshot() {
    return Object.freeze({
      nodes: Object.freeze([...nodeMap.values()].map(node => Object.freeze({
        ...node,
        stock: Object.freeze({ ...node.stock }),
        assets: Object.freeze({ ...node.assets }),
      }))),
      routes: Object.freeze([...routeMap.values()].map(route => Object.freeze({ ...route }))),
      convoys: Object.freeze([...convoys.values()].map(convoy => Object.freeze({
        ...convoy,
        cargo: Object.freeze({ ...convoy.cargo }),
        assets: Object.freeze({ ...convoy.assets }),
        path: Object.freeze(convoy.path.map(step => Object.freeze({ ...step }))),
      }))),
    });
  }

  return Object.freeze({ dispatch, step, route, setRouteOpen, snapshot, getNode: id => nodeMap.get(String(id)) || null });
}
