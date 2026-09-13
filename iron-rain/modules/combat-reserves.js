import { territoryOperationalEffects } from './territory-ai.js';

const bool = value => value === true;
const validTeam = team => team === 'ally' || team === 'enemy';
const positiveFinite = value => Number.isFinite(value) && value > 0;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function validRoutePath(path, originId, destinationId) {
  if (!Array.isArray(path) || path.length === 0) return false;
  let expectedFrom = String(originId ?? '');
  for (const leg of path) {
    const from = String(leg?.from ?? '');
    const to = String(leg?.to ?? '');
    if (!from || !to || from !== expectedFrom || !positiveFinite(Number(leg?.distance))) return false;
    expectedFrom = to;
  }
  return expectedFrom === String(destinationId ?? '');
}

/**
 * Ask the canonical strategic-logistics graph whether a friendly route really
 * exists. This intentionally delegates pathfinding to `strategic-logistics.js`
 * instead of duplicating adjacency/routing rules inside combat AI.
 */
export function combatRouteOpen({ logistics, team, from, to } = {}) {
  if (!validTeam(team) || !logistics || typeof logistics.route !== 'function' || typeof logistics.getNode !== 'function') return false;
  const origin = logistics.getNode(String(from ?? ''));
  const destination = logistics.getNode(String(to ?? ''));
  if (!origin?.alive || !destination?.alive || origin.team !== team || destination.team !== team) return false;
  if (origin.id === destination.id) return true;
  try {
    const path = logistics.route(team, origin.id, destination.id);
    return validRoutePath(path, origin.id, destination.id);
  } catch {
    return false;
  }
}

/**
 * Resolve the nearest reachable rear depot from the canonical logistics graph.
 * Combat AI does not create an adjacency graph or guess a straight-line path:
 * every candidate is measured using `strategicLogistics.route()` itself. This
 * lets orchestration provide only the destination sector when the rear origin
 * is already represented by the shared world logistics state.
 */
export function combatReserveOrigin({ strategicLogistics, team, to } = {}) {
  if (!validTeam(team) || !strategicLogistics || typeof strategicLogistics.route !== 'function' || typeof strategicLogistics.getNode !== 'function' || typeof strategicLogistics.snapshot !== 'function') return null;
  const destination = strategicLogistics.getNode(String(to ?? ''));
  if (!destination?.alive || destination.team !== team) return null;
  let nodes;
  try {
    nodes = strategicLogistics.snapshot()?.nodes;
  } catch {
    return null;
  }
  if (!Array.isArray(nodes)) return null;

  let best = null;
  for (const node of nodes) {
    if (!node?.alive || node.team !== team || node.kind !== 'depot' || node.id === destination.id) continue;
    let path;
    try {
      path = strategicLogistics.route(team, node.id, destination.id);
    } catch {
      continue;
    }
    if (!validRoutePath(path, node.id, destination.id)) continue;
    const distance = path.reduce((sum, leg) => sum + Number(leg.distance), 0);
    if (!positiveFinite(distance)) continue;
    if (!best || distance < best.distance || (distance === best.distance && String(node.id) < String(best.id))) best = { id: node.id, distance };
  }
  return best?.id || null;
}

/**
 * Read-only bridge from canonical territory/route state to the reserve gate.
 * It never creates supply, opens routes or builds structures; callers provide
 * route reachability already earned from the strategic logistics simulation.
 */
export function combatLogisticsState({ territory, team, routeOpen = false } = {}) {
  const friendly = validTeam(team) && territory?.owner === team && territory?.contested === false;
  const connected = friendly && bool(routeOpen);
  const structures = new Set(friendly && Array.isArray(territory?.structures) ? territory.structures : []);
  const hasOutpost = structures.has('outpost');
  const hasDepot = structures.has('depot');
  const hasGarage = structures.has('garage');
  const effects = territoryOperationalEffects(friendly ? territory : null);
  const reinforcementSupport = friendly && positiveFinite(effects.reinforcementSupport) ? effects.reinforcementSupport : 0;
  const canReceiveReinforcements = connected && (hasOutpost || hasDepot || hasGarage) && reinforcementSupport > 0;

  return Object.freeze({
    connected,
    hasOutpost,
    hasDepot,
    hasGarage,
    canReceiveReinforcements,
    reinforcementSupport,
  });
}

function combatDeliveredTroops(strategicLogistics, to) {
  if (!strategicLogistics || typeof strategicLogistics.getNode !== 'function') return null;
  try {
    const destination = strategicLogistics.getNode(String(to ?? ''));
    if (!destination?.alive) return 0;
    // Lightweight route mocks predate physical asset inventories. Treat an
    // absent inventory as "not modelled" rather than silently inventing zero;
    // canonical strategic-logistics nodes always expose `assets.troops`.
    if (!destination.assets || !hasOwn(destination.assets, 'troops')) return null;
    return Math.max(0, Math.floor(Number(destination.assets.troops) || 0));
  } catch {
    return 0;
  }
}

function consumeDeliveredTroops(strategicLogistics, to, amount) {
  if (!strategicLogistics || typeof strategicLogistics.getNode !== 'function') return null;
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  if (requested <= 0) return null;
  try {
    const destination = strategicLogistics.getNode(String(to ?? ''));
    if (!destination?.alive || !destination.assets || !hasOwn(destination.assets, 'troops')) return null;
    const available = Math.max(0, Math.floor(Number(destination.assets.troops) || 0));
    if (available < requested) return false;
    destination.assets.troops = available - requested;
    return destination.assets.troops;
  } catch {
    return false;
  }
}

function withDeliveredTroops(logistics, strategicLogistics, to) {
  const availableTroops = combatDeliveredTroops(strategicLogistics, to);
  return availableTroops == null
    ? logistics
    : Object.freeze({ ...logistics, availableTroops });
}

/**
 * Pure admission gate for aggregate infantry reserves.
 *
 * Strategic timers still decide *when* a formation is due for replacements;
 * this gate only decides whether those replacements are physically able to
 * arrive. It intentionally does not create personnel or pick reinforcement
 * amounts. Callers must pass the local `combatLogisticsState()` snapshot earned
 * by the world/logistics simulation. When `availableTroops` is present, it
 * represents personnel already delivered to the staging node; an open road by
 * itself never materializes soldiers at the front.
 */
export function combatReserveGate({ logistics, timerExpired = false, fallbackComplete = false } = {}) {
  const connected = bool(logistics?.connected);
  const fieldNode = bool(logistics?.hasOutpost) || bool(logistics?.hasDepot) || bool(logistics?.hasGarage);
  const support = positiveFinite(logistics?.reinforcementSupport);
  const delivered = !hasOwn(logistics, 'availableTroops') || positiveFinite(logistics?.availableTroops);
  const logisticsReady = connected && fieldNode && support && delivered && bool(logistics?.canReceiveReinforcements);
  const due = bool(timerExpired);
  const fallbackReady = bool(fallbackComplete);
  const ready = due && fallbackReady && logisticsReady;

  let reason = 'ready';
  if (!due) reason = 'timer';
  else if (!fallbackReady) reason = 'fallback';
  else if (!connected) reason = 'route';
  else if (!fieldNode) reason = 'field-node';
  else if (!support) reason = 'support';
  else if (!delivered) reason = 'troops';
  else if (!bool(logistics?.canReceiveReinforcements)) reason = 'logistics';

  return Object.freeze({
    ready,
    reason,
    timerExpired: due,
    fallbackComplete: fallbackReady,
    logisticsReady,
  });
}

/**
 * Gameplay-scale reserve batch derived from the canonical territory support.
 * There is deliberately no unconditional minimum: light infrastructure yields
 * a small batch, while cut or malformed logistics yields zero replacements.
 * When a physical staging inventory is supplied, the batch is capped by troops
 * already present there and resolved to whole delivered troop units so combat
 * can debit exactly what it admits.
 *
 * The multiplier stays on the existing aggregate 0..100 front-strength scale;
 * it is a fictional gameplay value, not a real-world personnel table.
 */
export function combatReserveBatch({ logistics, deficit = 0 } = {}) {
  const shortage = Number.isFinite(deficit) ? Math.max(0, deficit) : 0;
  const support = positiveFinite(logistics?.reinforcementSupport) ? logistics.reinforcementSupport : 0;
  const fieldNode = bool(logistics?.hasOutpost) || bool(logistics?.hasDepot) || bool(logistics?.hasGarage);
  const delivered = !hasOwn(logistics, 'availableTroops') || positiveFinite(logistics?.availableTroops);
  const ready = bool(logistics?.connected) && fieldNode && bool(logistics?.canReceiveReinforcements) && support > 0 && delivered;
  if (!ready || shortage <= 0) return 0;
  const supported = Math.min(shortage, support * 20);
  if (!hasOwn(logistics, 'availableTroops')) return supported;
  return Math.min(Math.floor(supported), Math.floor(logistics.availableTroops));
}

/**
 * Single read-only decision for the strategic reinforcement timer. Keeping the
 * gate and batch together prevents callers from admitting a reserve through
 * one logistics snapshot and sizing it from another one.
 */
export function combatReserveDecision({ logistics, timerExpired = false, fallbackComplete = false, deficit = 0 } = {}) {
  const gate = combatReserveGate({ logistics, timerExpired, fallbackComplete });
  const amount = gate.ready ? combatReserveBatch({ logistics, deficit }) : 0;
  return Object.freeze({
    ready: gate.ready && amount > 0,
    reason: gate.ready && amount <= 0 ? 'deficit' : gate.reason,
    amount,
    timerExpired: gate.timerExpired,
    fallbackComplete: gate.fallbackComplete,
    logisticsReady: gate.logisticsReady,
  });
}

/**
 * Compose the full read-only reserve path from canonical strategic logistics
 * and territory state. Callers hand over the graph/endpoints already owned by
 * the world simulation; combat AI only asks whether the route exists, derives
 * the local territory effects, and makes one admission+batch decision from
 * that same snapshot. No pathfinding, stock or infrastructure is duplicated.
 */
export function combatReservePlan({
  strategicLogistics,
  territory,
  team,
  from,
  to,
  timerExpired = false,
  fallbackComplete = false,
  deficit = 0,
} = {}) {
  const origin = from == null ? combatReserveOrigin({ strategicLogistics, team, to }) : from;
  const routeOpen = combatRouteOpen({ logistics: strategicLogistics, team, from: origin, to });
  const logistics = withDeliveredTroops(combatLogisticsState({ territory, team, routeOpen }), strategicLogistics, to);
  const decision = combatReserveDecision({ logistics, timerExpired, fallbackComplete, deficit });
  return Object.freeze({ origin, routeOpen, logistics, ...decision });
}

/**
 * Advance one reserve countdown without consuming an already-due request when
 * route/fallback conditions are temporarily blocked. The timer stays at zero
 * until a positive batch is actually admitted, then resets for the next cycle.
 */
export function combatReserveCycle({ logistics, timer = 0, fallbackUntil = 0, tick = 0, strength = 0, resetIn = 40 } = {}) {
  const remaining = Number.isFinite(timer) ? Math.max(0, timer - 1) : 0;
  const currentTick = Number.isFinite(tick) ? tick : 0;
  const fallbackTick = Number.isFinite(fallbackUntil) ? fallbackUntil : Infinity;
  const currentStrength = Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) : 100;
  const decision = combatReserveDecision({
    logistics,
    timerExpired: remaining <= 0,
    fallbackComplete: currentTick >= fallbackTick,
    deficit: 100 - currentStrength,
  });
  const interval = Number.isFinite(resetIn) && resetIn > 0 ? Math.max(1, Math.floor(resetIn)) : 40;
  return Object.freeze({ ...decision, nextTimer: decision.ready ? interval : remaining });
}

/**
 * Canonical one-shot reserve tick for the strategic simulator. Route reachability,
 * territory effects, fallback readiness, deficit sizing and timer consumption all
 * come from the same inputs. Standalone consumers debit the destination staging
 * inventory here. The live world wrapper already owns an atomic `claimAsset`
 * reconciliation step, so contexts exposing that seam defer the mutation to it
 * and avoid charging the same delivered troops twice.
 */
export function combatReservePlanCycle({
  strategicLogistics,
  territory,
  team,
  from,
  to,
  claimAsset,
  timer = 0,
  fallbackUntil = 0,
  tick = 0,
  strength = 0,
  resetIn = 40,
} = {}) {
  const origin = from == null ? combatReserveOrigin({ strategicLogistics, team, to }) : from;
  const routeOpen = combatRouteOpen({ logistics: strategicLogistics, team, from: origin, to });
  const logistics = withDeliveredTroops(combatLogisticsState({ territory, team, routeOpen }), strategicLogistics, to);
  const cycle = combatReserveCycle({ logistics, timer, fallbackUntil, tick, strength, resetIn });
  if (!cycle.ready || !hasOwn(logistics, 'availableTroops')) return Object.freeze({ origin, routeOpen, logistics, ...cycle });

  if (typeof claimAsset === 'function') {
    return Object.freeze({ origin, routeOpen, logistics, ...cycle, debitDelegated: true });
  }

  const remainingTroops = consumeDeliveredTroops(strategicLogistics, to, cycle.amount);
  if (remainingTroops === false) {
    return Object.freeze({
      origin,
      routeOpen,
      logistics,
      ...cycle,
      ready: false,
      reason: 'troops',
      amount: 0,
      nextTimer: 0,
      remainingTroops: combatDeliveredTroops(strategicLogistics, to),
    });
  }
  return Object.freeze({ origin, routeOpen, logistics, ...cycle, remainingTroops });
}