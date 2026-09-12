import { territoryOperationalEffects } from './territory-ai.js';

const bool = value => value === true;
const validTeam = team => team === 'ally' || team === 'enemy';
const positiveFinite = value => Number.isFinite(value) && value > 0;

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
  try {
    return Array.isArray(logistics.route(team, origin.id, destination.id));
  } catch {
    return false;
  }
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

/**
 * Pure admission gate for aggregate infantry reserves.
 *
 * Strategic timers still decide *when* a formation is due for replacements;
 * this gate only decides whether those replacements are physically able to
 * arrive. It intentionally does not create personnel, consume stock, or pick
 * reinforcement amounts. Callers must pass the local `combatLogisticsState()`
 * snapshot earned by the world/logistics simulation.
 */
export function combatReserveGate({ logistics, timerExpired = false, fallbackComplete = false } = {}) {
  const connected = bool(logistics?.connected);
  const fieldNode = bool(logistics?.hasOutpost) || bool(logistics?.hasDepot) || bool(logistics?.hasGarage);
  const support = positiveFinite(logistics?.reinforcementSupport);
  const logisticsReady = connected && fieldNode && support && bool(logistics?.canReceiveReinforcements);
  const due = bool(timerExpired);
  const fallbackReady = bool(fallbackComplete);
  const ready = due && fallbackReady && logisticsReady;

  let reason = 'ready';
  if (!due) reason = 'timer';
  else if (!fallbackReady) reason = 'fallback';
  else if (!connected) reason = 'route';
  else if (!fieldNode) reason = 'field-node';
  else if (!support) reason = 'support';
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
 *
 * The multiplier stays on the existing aggregate 0..100 front-strength scale;
 * it is a fictional gameplay value, not a real-world personnel table.
 */
export function combatReserveBatch({ logistics, deficit = 0 } = {}) {
  const shortage = Number.isFinite(deficit) ? Math.max(0, deficit) : 0;
  const support = positiveFinite(logistics?.reinforcementSupport) ? logistics.reinforcementSupport : 0;
  const fieldNode = bool(logistics?.hasOutpost) || bool(logistics?.hasDepot) || bool(logistics?.hasGarage);
  const ready = bool(logistics?.connected) && fieldNode && bool(logistics?.canReceiveReinforcements) && support > 0;
  if (!ready || shortage <= 0) return 0;
  return Math.min(shortage, support * 20);
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
