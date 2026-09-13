import { assessIntelAge } from './intel-knowledge.js';
import { CAPITAL_HEAVY_KIT_KEYS } from './capital-city-layout.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const stockKeys = Object.freeze(['materials', 'ammo', 'fuel']);
export const LOGISTICS_ASSET_KEYS = Object.freeze(['trucks', 'tanks', 'troops', ...CAPITAL_HEAVY_KIT_KEYS]);
const MAX_CONVOY_SPEED = 120;
const copyStock = value => Object.fromEntries(stockKeys.map(key => [key, Math.max(0, Number(value?.[key]) || 0)]));
const copyAssets = value => {
  const out = Object.fromEntries(['trucks', 'tanks', 'troops'].map(key => [key, Math.max(0, Math.floor(Number(value?.[key]) || 0))]));
  for (const key of CAPITAL_HEAVY_KIT_KEYS) { const amount = Math.max(0, Math.floor(Number(value?.[key]) || 0)); if (amount > 0 || Object.prototype.hasOwnProperty.call(value || {}, key)) out[key] = amount; }
  return out;
};
const safeConvoySpeed = value => { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed <= 0) return 14; return Math.min(parsed, MAX_CONVOY_SPEED); };

function heavyManifestState(manifest) {
  const entries = CAPITAL_HEAVY_KIT_KEYS.filter(key => (manifest?.[key] || 0) > 0);
  const count = entries.reduce((sum, key) => sum + (manifest?.[key] || 0), 0);
  return { entries, count };
}

export function createLogisticsNode({ id, team, x = 0, y = 0, stock = {}, assets = {}, kind = 'outpost' } = {}) {
  return { id: String(id ?? ''), team: team === 'ally' || team === 'enemy' ? team : null, x: Number(x) || 0, y: Number(y) || 0, kind, alive: true, stock: copyStock(stock), assets: copyAssets(assets) };
}

export function createSupplyRoute({ id, team, from, to, distance = 1_000, laneOffset = 3.2 } = {}) {
  return { id: String(id ?? `${from}-${to}`), team: team === 'ally' || team === 'enemy' ? team : null, from: String(from ?? ''), to: String(to ?? ''), distance: Math.max(1, Number(distance) || 1_000), laneOffset: Math.max(0, Number(laneOffset) || 0), open: true, threat: 0, threatIntel: null };
}

function canPay(stock, cargo) { return stockKeys.every(key => (stock?.[key] || 0) >= (cargo?.[key] || 0)); }
function debit(stock, cargo) { for (const key of stockKeys) stock[key] = Math.max(0, stock[key] - (cargo[key] || 0)); }
function credit(stock, cargo) { for (const key of stockKeys) stock[key] = Math.max(0, stock[key] + (cargo[key] || 0)); }
function canPayAssets(assets, manifest) { return LOGISTICS_ASSET_KEYS.every(key => (assets?.[key] || 0) >= (manifest?.[key] || 0)); }
function debitAssets(assets, manifest) { for (const key of LOGISTICS_ASSET_KEYS) { const amount = manifest[key] || 0; if (amount > 0) assets[key] = Math.max(0, (assets[key] || 0) - amount); } }
function creditAssets(assets, manifest) { for (const key of LOGISTICS_ASSET_KEYS) { const amount = manifest[key] || 0; if (amount > 0) assets[key] = Math.max(0, (assets[key] || 0) + amount); } }

export function createStrategicLogistics({ nodes = [], routes = [] } = {}) {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const routeMap = new Map(routes.map(route => [route.id, route]));
  const convoys = new Map();
  let serial = 0;
  let intelNow = 0;

  function adjacency(team) {
    const graph = new Map();
    for (const route of routeMap.values()) {
      if (!route.open || route.team !== team) continue;
      const fromNode = nodeMap.get(route.from), toNode = nodeMap.get(route.to);
      if (!fromNode?.alive || !toNode?.alive || fromNode.team !== team || toNode.team !== team) continue;
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
  function routeCost(item, now = intelNow) { return item.distance * (1 + knownRouteThreat(item, now)); }

  function route(team, from, to, { now = intelNow } = {}) {
    const routeNow = Number(now); if (Number.isFinite(routeNow)) intelNow = Math.max(intelNow, routeNow);
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
        frontier.push({ id: edge.node, cost: nextCost, path: [...current.path, { routeId: edge.route.id, from: current.id, to: edge.node, distance: edge.route.distance, laneDirection: edge.laneDirection, laneOffset: edge.route.laneOffset }] });
      }
    }
    return null;
  }

  function dispatch({ team, from, to, cargo = {}, assets = {}, speed = 14, kind = 'supply', now = intelNow } = {}) {
    const dispatchNow = Number(now); if (Number.isFinite(dispatchNow)) intelNow = Math.max(intelNow, dispatchNow);
    const origin = nodeMap.get(String(from)), destination = nodeMap.get(String(to));
    const load = copyStock(cargo), manifest = copyAssets(assets);
    const heavy = heavyManifestState(manifest);
    if (!origin?.alive || !destination?.alive || origin.team !== team || destination.team !== team) return Object.freeze({ ok: false, reason: 'invalid-endpoint' });
    if (heavy.count > 1 || heavy.entries.length > 1) return Object.freeze({ ok: false, reason: 'heavy-kit-dedicated-transport-required' });
    if (heavy.count === 1) {
      if (manifest.trucks !== 1) return Object.freeze({ ok: false, reason: 'heavy-kit-requires-one-truck' });
      const hasOtherAssets = (manifest.tanks || 0) > 0 || (manifest.troops || 0) > 0;
      const hasCargo = stockKeys.some(key => (load[key] || 0) > 0);
      if (hasOtherAssets || hasCargo) return Object.freeze({ ok: false, reason: 'heavy-kit-dedicated-transport-required' });
    }
    if (!canPay(origin.stock, load)) return Object.freeze({ ok: false, reason: 'origin-stock-insufficient' });
    if (!canPayAssets(origin.assets, manifest)) return Object.freeze({ ok: false, reason: 'origin-assets-insufficient' });
    const path = route(team, origin.id, destination.id, { now: intelNow });
    if (!path) return Object.freeze({ ok: false, reason: 'route-cut' });
    debit(origin.stock, load); debitAssets(origin.assets, manifest);
    const convoy = { id: `CV-${++serial}`, kind: String(kind || 'supply'), team, from: origin.id, to: destination.id, cargo: load, assets: manifest, path: [...path], leg: 0, legProgress: 0, speed: safeConvoySpeed(speed), hp: 100, status: path.length ? 'moving' : 'arrived' };
    if (!path.length) { credit(destination.stock, load); creditAssets(destination.assets, manifest); } else convoys.set(convoy.id, convoy);
    return Object.freeze({ ok: true, convoyId: convoy.id, status: convoy.status });
  }

  function routeStillOpen(convoy) {
    const leg = convoy.path[convoy.leg]; if (!leg) return true;
    const stored = routeMap.get(leg.routeId), fromNode = nodeMap.get(leg.from), toNode = nodeMap.get(leg.to);
    return Boolean(stored?.open && stored.team === convoy.team && fromNode?.alive && toNode?.alive && fromNode.team === convoy.team && toNode.team === convoy.team);
  }
  function routeTransitionEvent(type, convoy) { const leg = convoy.path[convoy.leg] || null; return { type, convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, routeId: leg?.routeId ?? null, fromNode: leg?.from ?? null, toNode: leg?.to ?? null }; }
  function rerouteFromCurrentNode(convoy) {
    const currentLeg = convoy.path[convoy.leg] || null;
    if (!currentLeg || convoy.legProgress > 1e-6) return null;
    const detour = route(convoy.team, currentLeg.from, convoy.to);
    if (!detour?.length || detour[0].routeId === currentLeg.routeId) return null;
    const previousRouteId = currentLeg.routeId, prefix = convoy.path.slice(0, convoy.leg);
    convoy.path = [...prefix, ...detour]; convoy.legProgress = 0;
    const nextLeg = convoy.path[convoy.leg] || null;
    return { previousRouteId, routeId: nextLeg?.routeId ?? null, fromNode: nextLeg?.from ?? currentLeg.from, toNode: nextLeg?.to ?? null };
  }
  function rerouteEvent(convoy, change) { return { type: 'convoy-rerouted', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, previousRouteId: change.previousRouteId, routeId: change.routeId, fromNode: change.fromNode, toNode: change.toNode }; }
  function convoyPosition(convoy) {
    const leg = convoy.path[convoy.leg]; if (!leg) return null;
    const fromNode = nodeMap.get(leg.from), toNode = nodeMap.get(leg.to); if (!fromNode || !toNode) return null;
    const dx = toNode.x - fromNode.x, dy = toNode.y - fromNode.y, geometryLength = Math.hypot(dx, dy), q = clamp(convoy.legProgress / Math.max(1, leg.distance), 0, 1), laneOffset = Math.max(0, Number(leg.laneOffset) || 0), nx = geometryLength > 1e-6 ? -dy / geometryLength : 0, ny = geometryLength > 1e-6 ? dx / geometryLength : 0;
    return Object.freeze({ x: fromNode.x + dx * q + nx * laneOffset, y: fromNode.y + dy * q + ny * laneOffset, heading: Math.atan2(dy, dx), routeId: leg.routeId, laneDirection: leg.laneDirection || 'forward', laneOffset });
  }

  function step(dt, { damageByConvoy = {} } = {}) {
    const elapsed = clamp(dt, 0, 60), events = []; intelNow += elapsed;
    for (const convoy of convoys.values()) {
      if (['arrived', 'destroyed'].includes(convoy.status)) continue;
      convoy.hp = clamp(convoy.hp - Math.max(0, Number(damageByConvoy[convoy.id]) || 0), 0, 100);
      if (convoy.hp <= 0) { convoy.status = 'destroyed'; events.push({ type: 'convoy-destroyed', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, lostCargo: { ...convoy.cargo }, lostAssets: { ...convoy.assets } }); continue; }
      const previousStatus = convoy.status;
      const junctionReroute = rerouteFromCurrentNode(convoy); if (junctionReroute) events.push(rerouteEvent(convoy, junctionReroute));
      if (!routeStillOpen(convoy)) {
        const reroute = rerouteFromCurrentNode(convoy);
        if (!reroute) { convoy.status = 'blocked'; if (previousStatus !== 'blocked') events.push(routeTransitionEvent('convoy-blocked', convoy)); continue; }
        convoy.status = 'moving'; events.push(rerouteEvent(convoy, reroute)); if (previousStatus === 'blocked') events.push(routeTransitionEvent('convoy-resumed', convoy));
      }
      convoy.status = 'moving';
      if (previousStatus === 'blocked' && !events.some(event => event.type === 'convoy-resumed' && event.convoyId === convoy.id)) events.push(routeTransitionEvent('convoy-resumed', convoy));
      let travel = convoy.speed * elapsed;
      while (travel > 0 && convoy.leg < convoy.path.length) {
        if (convoy.legProgress <= 1e-6) { const reroute = rerouteFromCurrentNode(convoy); if (reroute) events.push(rerouteEvent(convoy, reroute)); }
        const leg = convoy.path[convoy.leg], remaining = leg.distance - convoy.legProgress, move = Math.min(travel, remaining);
        convoy.legProgress += move; travel -= move;
        if (convoy.legProgress >= leg.distance - 1e-6) { convoy.leg += 1; convoy.legProgress = 0; }
        if (convoy.leg < convoy.path.length && !routeStillOpen(convoy)) {
          const reroute = rerouteFromCurrentNode(convoy); if (reroute) { events.push(rerouteEvent(convoy, reroute)); continue; }
          convoy.status = 'blocked'; events.push(routeTransitionEvent('convoy-blocked', convoy)); break;
        }
      }
      if (convoy.leg >= convoy.path.length) {
        const destination = nodeMap.get(convoy.to);
        if (destination?.alive && destination.team === convoy.team) { credit(destination.stock, convoy.cargo); creditAssets(destination.assets, convoy.assets); convoy.status = 'arrived'; events.push({ type: 'convoy-arrived', convoyId: convoy.id, team: convoy.team, to: convoy.to, kind: convoy.kind, cargo: { ...convoy.cargo }, assets: { ...convoy.assets } }); }
        else { const wasBlocked = convoy.status === 'blocked'; convoy.status = 'blocked'; if (!wasBlocked) events.push(routeTransitionEvent('convoy-blocked', convoy)); }
      }
    }
    return Object.freeze(events.map(event => Object.freeze(event)));
  }

  function setRouteOpen(routeId, open, threat = null) { const item = routeMap.get(String(routeId)); if (!item) return false; item.open = Boolean(open); if (Number.isFinite(threat)) item.threat = clamp(threat, 0, 1); return true; }
  function reportRouteThreat(routeId, { team, threat, reportedAt = intelNow } = {}) { const item = routeMap.get(String(routeId)), observedAt = Number(reportedAt); if (!item || item.team !== team || !Number.isFinite(threat) || !Number.isFinite(observedAt)) return false; const previous = item.threatIntel; if (previous && Number(previous.reportedAt) > observedAt) return false; item.threatIntel = { threat: clamp(threat, 0, 1), reportedAt: observedAt }; intelNow = Math.max(intelNow, observedAt); return true; }
  function snapshot() { return Object.freeze({ nodes: Object.freeze([...nodeMap.values()].map(node => Object.freeze({ ...node, stock: Object.freeze({ ...node.stock }), assets: Object.freeze({ ...node.assets }) }))), routes: Object.freeze([...routeMap.values()].map(route => Object.freeze({ ...route, knownThreat: knownRouteThreat(route), threatIntel: route.threatIntel ? Object.freeze({ ...route.threatIntel }) : null }))), convoys: Object.freeze([...convoys.values()].map(convoy => Object.freeze({ ...convoy, position: convoyPosition(convoy), cargo: Object.freeze({ ...convoy.cargo }), assets: Object.freeze({ ...convoy.assets }), path: Object.freeze(convoy.path.map(step => Object.freeze({ ...step }))) }))) }); }
  return Object.freeze({ dispatch, step, route, setRouteOpen, reportRouteThreat, snapshot, getNode: id => nodeMap.get(String(id)) || null });
}
