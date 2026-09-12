import { territoryOperationalEffects } from './territory-ai.js';

const bool = value => value === true;
const validTeam = team => team === 'ally' || team === 'enemy';

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
  const canReceiveReinforcements = connected && (hasOutpost || hasDepot || hasGarage) && effects.reinforcementSupport > 0;

  return Object.freeze({
    connected,
    hasOutpost,
    hasDepot,
    hasGarage,
    canReceiveReinforcements,
    reinforcementSupport: friendly ? effects.reinforcementSupport : 0,
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
  const logisticsReady = connected && fieldNode && bool(logistics?.canReceiveReinforcements);
  const due = bool(timerExpired);
  const fallbackReady = bool(fallbackComplete);
  const ready = due && fallbackReady && logisticsReady;

  let reason = 'ready';
  if (!due) reason = 'timer';
  else if (!fallbackReady) reason = 'fallback';
  else if (!connected) reason = 'route';
  else if (!fieldNode) reason = 'field-node';
  else if (!bool(logistics?.canReceiveReinforcements)) reason = 'logistics';

  return Object.freeze({
    ready,
    reason,
    timerExpired: due,
    fallbackComplete: fallbackReady,
    logisticsReady,
  });
}
