import { assessIntelAge } from './intel-knowledge.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const stockKeys = Object.freeze(['materials', 'ammo', 'fuel']);
export const LOGISTICS_ASSET_KEYS = Object.freeze(['trucks', 'tanks', 'troops']);
const MAX_CONVOY_SPEED = 120;
const copyStock = value => Object.fromEntries(stockKeys.map(key => [key, Math.max(0, Number(value?.[key]) || 0)]));
const copyAssets = value => Object.fromEntries(LOGISTICS_ASSET_KEYS.map(key => [key, Math.max(0, Math.floor(Number(value?.[key]) || 0))]));
const safeConvoySpeed = value => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 14;
  return Math.min(parsed, MAX_CONVOY_SPEED);
};

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

export function createSupplyRoute({ id, team, from, to, distance = 1_000, laneOffset = 3.2 } = {}) {
  return {
    id: String(id ?? `${from}-${to}`),
    team: team === 'ally' || team === 'enemy' ? team : null,
    from: String(from ?? ''),
    to: String(to ?? ''),
    distance: Math.max(1, Number(distance) || 1_000),
    laneOffset: Math.max(0, Number(laneOffset) || 0),
    open: true,
    threat: 0,
    threatIntel: null,
  };
}

function canPay(stock, cargo) { return stockKeys.every(key => (stock?.[key] || 0) >= (cargo?.[key] || 0)); }
function debit(stock, cargo) { for (const key of stockKeys) stock[key] = Math.max(0, stock[key] - (cargo[key] || 0)); }
function credit(stock, cargo) { for (const key of stockKeys) stock[key] = Math.max(0, stock[key] + (cargo[key] || 0)); }
function canPayAssets(assets, manifest) { return LOGISTICS_ASSET_KEYS.every(key => (assets?.[key] || 0) >= (manifest?.[key] || 0)); }
function debitAssets(assets, manifest) { for (const key of LOGISTICS_ASSET_KEYS) assets[key] = Math.max(0, (assets[key] || 0) - (manifest[key] || 0)); }
function creditAssets(assets, manifest) { for (const key of LOGISTICS_ASSET_KEYS) assets[key] = Math.max(0, (assets[key] || 0) + (manifest[key] || 0)); }

export function createStrategicLogistics({ nodes = [], routes = [], restore = null } = {}) {
  if (restore && restore.version !== 1) throw new Error('Unsupported logistics checkpoint version');
  if (restore) {
    nodes = (restore.nodes || []).map(node => ({ ...createLogisticsNode(node), alive: node.alive !== false }));
    routes = (restore.routes || []).map(route => ({
      ...createSupplyRoute(route), open: route.open !== false,
      threat: clamp(Number(route.threat), 0, 1),
      threatIntel: route.threatIntel ? { ...route.threatIntel } : null,
    }));
  }
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const routeMap = new Map(routes.map(route => [route.id, route]));
  const convoys = new Map();
  let serial = Math.max(0, Math.floor(Number(restore?.serial) || 0));
  let intelNow = Math.max(0, Number(restore?.intelNow) || 0);
  for (const saved of restore?.convoys || []) {
    const { position: _derivedPosition, ...data } = saved;
    const convoy = { ...data, cargo: copyStock(saved.cargo), assets: copyAssets(saved.assets), path: (saved.path || []).map(leg => ({ ...leg })) };
    if (!convoy.id || !convoy.path.length || !nodeMap.has(convoy.from) || !nodeMap.has(convoy.to)) throw new Error('Invalid logistics convoy checkpoint');
    convoys.set(convoy.id, convoy);
    const suffix = /^CV-(\d+)$/.exec(convoy.id);
    if (suffix) serial = Math.max(serial, Number(suffix[1]));
  }

  function adjacency(team) {
    const graph = new Map();
    for (const route of routeMap.values()) {
      if (!route.open || route.team !== team) continue;
      const fromNode = nodeMap.get(route.from), toNode = nodeMap.get(route.to);
      if (!fromNode?.alive || !toNode?.alive) continue;
      if (fromNode.team !== team || toNode.team !== team) continue;
      if (!graph.has(route.from)) graph.set(route.from, []);
      if (!graph.has(route.to)) graph.set(route.to, []);
      graph.get(route.from).push({ node: route.to, route, laneDirection: 'forward' });
      graph.get(route.to).push({ node: route.from, route, laneDirection: 'return' });
    }
    return graph;
  }

  function knownRouteThreat(item, now = intelNow) {
    const intel = item?.threatIntel;
    if (!intel) return 0;
    const state = assessIntelAge({ reportedAt: intel.reportedAt }, now).state;
    return state === 'fresh' || state === 'aging' ? clamp(intel.threat, 0, 1) : 0;
  }

  function routeCost(item, now = intelNow) {
    return item.distance * (1 + knownRouteThreat(item, now));
  }

  function route(team, from, to, { now = intelNow } = {}) {
    const routeNow = Number(now);
    if (Number.isFinite(routeNow)) intelNow = Math.max(intelNow, routeNow);
    const effectiveNow = intelNow;
    if (from === to) return Object.freeze([]);
    const graph = adjacency(team), frontier = [{ id: from, cost: 0, path: [] }], best = new Map([[from, 0]]);
    while (frontier.length) {
      frontier.sort((a, b) => a.cost - b.cost);
      const current = frontier.shift();
      if (current.id === to) return Object.freeze(current.path.map(step => Object.freeze(step)));
      for (const edge of graph.get(current.id) || []) {
        const nextCost = current.cost + routeCost(edge.route, effectiveNow);
        if ((best.get(edge.node) ?? Infinity) <= nextCost) continue;
        best.set(edge.node, nextCost);
        frontier.push({ id: edge.node, cost: nextCost, path: [...current.path, {
          routeId: edge.route.id,
          from: current.id,
          to: edge.node,
          distance: edge.route.distance,
          laneDirection: edge.laneDirection,
          laneOffset: edge.route.laneOffset,
        }] });
      }
    }
    return null;
  }

  function dispatch({ team, from, to, cargo = {}, assets = {}, speed = 14, kind = 'supply', now = intelNow } = {}) {
    const dispatchNow = Number(now);
    if (Number.isFinite(dispatchNow)) intelNow = Math.max(intelNow, dispatchNow);
    const origin = nodeMap.get(String(from)), destination = nodeMap.get(String(to));
    const load = copyStock(cargo), manifest = copyAssets(assets);
    if (!origin?.alive || !destination?.alive || origin.team !== team || destination.team !== team) return Object.freeze({ ok: false, reason: 'invalid-endpoint' });
    if (!canPay(origin.stock, load)) return Object.freeze({ ok: false, reason: 'origin-stock-insufficient' });
    if (!canPayAssets(origin.assets, manifest)) return Object.freeze({ ok: false, reason: 'origin-assets-insufficient' });
    const path = route(team, origin.id, destination.id, { now: intelNow });
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
      speed: safeConvoySpeed(speed),
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
    const fromNode = nodeMap.get(leg.from), toNode = nodeMap.get(leg.to);
    return Boolean(stored?.open && stored.team === convoy.team && fromNode?.alive && toNode?.alive && fromNode.team === convoy.team && toNode.team === convoy.team);
  }

  function routeTransitionEvent(type, convoy) {
    const leg = convoy.path[convoy.leg] || null;
    return { type, convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, routeId: leg?.routeId ?? null, fromNode: leg?.from ?? null, toNode: leg?.to ?? null };
  }

  function rerouteFromCurrentNode(convoy) {
    const currentLeg = convoy.path[convoy.leg] || null;
    if (!currentLeg || convoy.legProgress > 1e-6) return null;
    const detour = route(convoy.team, currentLeg.from, convoy.to);
    if (!detour?.length || detour[0].routeId === currentLeg.routeId) return null;
    const previousRouteId = currentLeg.routeId;
    const prefix = convoy.path.slice(0, convoy.leg);
    convoy.path = [...prefix, ...detour];
    convoy.legProgress = 0;
    const nextLeg = convoy.path[convoy.leg] || null;
    return { previousRouteId, routeId: nextLeg?.routeId ?? null, fromNode: nextLeg?.from ?? currentLeg.from, toNode: nextLeg?.to ?? null };
  }

  function rerouteEvent(convoy, change) {
    return { type: 'convoy-rerouted', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, previousRouteId: change.previousRouteId, routeId: change.routeId, fromNode: change.fromNode, toNode: change.toNode };
  }

  function convoyPosition(convoy) {
    // Preserve the physical destination after arrival. Renderers can retire this
    // entity by status without replacing a missing position with its origin.
    const arrived = convoy.leg >= convoy.path.length;
    const leg = convoy.path[arrived ? convoy.path.length - 1 : convoy.leg];
    if (!leg) return null;
    const fromNode = nodeMap.get(leg.from), toNode = nodeMap.get(leg.to);
    if (!fromNode || !toNode) return null;
    const dx = toNode.x - fromNode.x, dy = toNode.y - fromNode.y;
    const geometryLength = Math.hypot(dx, dy);
    const q = arrived ? 1 : clamp(convoy.legProgress / Math.max(1, leg.distance), 0, 1);
    const laneOffset = Math.max(0, Number(leg.laneOffset) || 0);
    // Adjacent roads have different normals. A fixed offset on both sides of a
    // junction jumped the truck sideways when its leg changed (or rerouted).
    // Merge into the common node over the final metres and leave it gradually.
    const mergeLength = Math.min(12, geometryLength * .2);
    const merge = mergeLength > 1e-6 ? clamp(Math.min(q, 1 - q) * geometryLength / mergeLength, 0, 1) : 0;
    const effectiveLaneOffset = laneOffset * merge * merge * (3 - 2 * merge);
    const nx = geometryLength > 1e-6 ? -dy / geometryLength : 0;
    const ny = geometryLength > 1e-6 ? dx / geometryLength : 0;
    return Object.freeze({ x: fromNode.x + dx * q + nx * effectiveLaneOffset, y: fromNode.y + dy * q + ny * effectiveLaneOffset, heading: Math.atan2(dy, dx), routeId: leg.routeId, laneDirection: leg.laneDirection || 'forward', laneOffset, effectiveLaneOffset });
  }

  function step(dt, { damageByConvoy = {} } = {}) {
    const elapsed = clamp(dt, 0, 60), events = [];
    intelNow += elapsed;
    for (const convoy of convoys.values()) {
      if (['arrived', 'destroyed'].includes(convoy.status)) continue;
      convoy.hp = clamp(convoy.hp - Math.max(0, Number(damageByConvoy[convoy.id]) || 0), 0, 100);
      if (convoy.hp <= 0) {
        convoy.status = 'destroyed';
        events.push({ type: 'convoy-destroyed', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, lostCargo: { ...convoy.cargo }, lostAssets: { ...convoy.assets } });
        continue;
      }
      const previousStatus = convoy.status;
      const junctionReroute = rerouteFromCurrentNode(convoy);
      if (junctionReroute) events.push(rerouteEvent(convoy, junctionReroute));
      if (!routeStillOpen(convoy)) {
        const reroute = rerouteFromCurrentNode(convoy);
        if (!reroute) {
          convoy.status = 'blocked';
          if (previousStatus !== 'blocked') events.push(routeTransitionEvent('convoy-blocked', convoy));
          continue;
        }
        convoy.status = 'moving';
        events.push(rerouteEvent(convoy, reroute));
        if (previousStatus === 'blocked') events.push(routeTransitionEvent('convoy-resumed', convoy));
      }
      convoy.status = 'moving';
      if (previousStatus === 'blocked' && !events.some(event => event.type === 'convoy-resumed' && event.convoyId === convoy.id)) events.push(routeTransitionEvent('convoy-resumed', convoy));
      let travel = convoy.speed * elapsed;
      while (travel > 0 && convoy.leg < convoy.path.length) {
        if (convoy.legProgress <= 1e-6) {
          const reroute = rerouteFromCurrentNode(convoy);
          if (reroute) events.push(rerouteEvent(convoy, reroute));
        }
        const leg = convoy.path[convoy.leg], remaining = leg.distance - convoy.legProgress;
        const move = Math.min(travel, remaining);
        convoy.legProgress += move; travel -= move;
        if (convoy.legProgress >= leg.distance - 1e-6) { convoy.leg += 1; convoy.legProgress = 0; }
        if (convoy.leg < convoy.path.length && !routeStillOpen(convoy)) {
          const reroute = rerouteFromCurrentNode(convoy);
          if (reroute) { events.push(rerouteEvent(convoy, reroute)); continue; }
          convoy.status = 'blocked'; events.push(routeTransitionEvent('convoy-blocked', convoy)); break;
        }
      }
      if (convoy.leg >= convoy.path.length) {
        const destination = nodeMap.get(convoy.to);
        if (destination?.alive && destination.team === convoy.team) {
          credit(destination.stock, convoy.cargo); creditAssets(destination.assets, convoy.assets); convoy.status = 'arrived';
          events.push({ type: 'convoy-arrived', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, cargo: { ...convoy.cargo }, assets: { ...convoy.assets } });
        } else {
          const wasBlocked = convoy.status === 'blocked'; convoy.status = 'blocked'; if (!wasBlocked) events.push(routeTransitionEvent('convoy-blocked', convoy));
        }
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

  function reportRouteThreat(routeId, { team, threat, reportedAt = intelNow } = {}) {
    const item = routeMap.get(String(routeId));
    const observedAt = Number(reportedAt);
    if (!item || item.team !== team || !Number.isFinite(threat) || !Number.isFinite(observedAt)) return false;
    const previous = item.threatIntel;
    if (previous && Number(previous.reportedAt) > observedAt) return false;
    item.threatIntel = { threat: clamp(threat, 0, 1), reportedAt: observedAt };
    intelNow = Math.max(intelNow, observedAt);
    return true;
  }

  function snapshot() {
    return Object.freeze({
      nodes: Object.freeze([...nodeMap.values()].map(node => Object.freeze({ ...node, stock: Object.freeze({ ...node.stock }), assets: Object.freeze({ ...node.assets }) }))),
      routes: Object.freeze([...routeMap.values()].map(route => Object.freeze({ ...route, knownThreat: knownRouteThreat(route), threatIntel: route.threatIntel ? Object.freeze({ ...route.threatIntel }) : null }))),
      convoys: Object.freeze([...convoys.values()].map(convoy => Object.freeze({ ...convoy, position: convoyPosition(convoy), cargo: Object.freeze({ ...convoy.cargo }), assets: Object.freeze({ ...convoy.assets }), path: Object.freeze(convoy.path.map(step => Object.freeze({ ...step }))) }))),
    });
  }

  // Authority checkpoint, separate from the immutable rendering projection.
  // Restoring must never dispatch cargo again or replay an arrival credit.
  function exportState() {
    const current = snapshot();
    return {
      version: 1, serial, intelNow,
      nodes: current.nodes.map(node => ({ ...node, stock: { ...node.stock }, assets: { ...node.assets } })),
      routes: current.routes.map(({ knownThreat: _derivedThreat, ...route }) => ({ ...route, threatIntel: route.threatIntel ? { ...route.threatIntel } : null })),
      convoys: current.convoys.map(({ position: _derivedPosition, ...convoy }) => ({ ...convoy, cargo: { ...convoy.cargo }, assets: { ...convoy.assets }, path: convoy.path.map(leg => ({ ...leg })) })),
    };
  }

  return Object.freeze({ dispatch, step, route, setRouteOpen, reportRouteThreat, snapshot, exportState, getNode: id => nodeMap.get(String(id)) || null });
}
