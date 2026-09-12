const bool = value => value === true;

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
