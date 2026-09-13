import { combatLogisticsState, combatReserveOrigin, combatRouteOpen } from './combat-reserves.js';
import { COMBAT_OFFENSIVE_THRESHOLDS, COMBAT_RECOVERY_THRESHOLDS } from './combat-recovery.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const validTeam = team => team === 'ally' || team === 'enemy';

function knownNodeThreat(routes, nodeId) {
  const target = String(nodeId ?? '');
  if (!target || !Array.isArray(routes)) return 0;
  let highest = 0;
  for (const route of routes) {
    if (String(route?.from ?? '') !== target && String(route?.to ?? '') !== target) continue;
    highest = Math.max(highest, clamp(Number(route?.knownThreat) || 0, 0, 1));
  }
  return highest;
}

function knownPathThreat(strategicLogistics, team, from, to) {
  if (!strategicLogistics || typeof strategicLogistics.route !== 'function' || typeof strategicLogistics.snapshot !== 'function') return 0;
  const origin = String(from ?? ''), destination = String(to ?? '');
  if (!origin || !destination) return 0;
  try {
    const routes = strategicLogistics.snapshot()?.routes;
    if (!Array.isArray(routes)) return 0;
    // A staging depot can be both the reserve origin and the tactical endpoint.
    // In that case there is no routed leg to inspect, but earned threat intel on
    // roads touching the node still means the position is under local pressure.
    if (origin === destination) return knownNodeThreat(routes, destination);
    const path = strategicLogistics.route(team, origin, destination);
    if (!Array.isArray(path)) return 0;
    const threatByRoute = new Map(routes.map(route => [String(route?.id ?? ''), clamp(Number(route?.knownThreat) || 0, 0, 1)]));
    let highest = 0;
    for (const leg of path) {
      const routeId = String(leg?.routeId ?? '');
      if (!routeId || !threatByRoute.has(routeId)) return 1;
      highest = Math.max(highest, threatByRoute.get(routeId) || 0);
    }
    return highest;
  } catch { return 0; }
}

/**
 * Read-only sustainment cap for tactical combat. The strategic logistics graph
 * remains authoritative for route reachability, earned threat intel and stock;
 * combat AI only turns that existing state into the same abstract 0..1 supply
 * scale already used by the tactical simulator. No stock is created or consumed
 * here.
 */
export function combatSustainmentSupply({ strategicLogistics, territory, team, from, to } = {}) {
  if (!validTeam(team) || !strategicLogistics) return .08;
  const destination = String(to ?? '');
  if (!destination) return .08;
  const origin = from == null ? combatReserveOrigin({ strategicLogistics, team, to: destination }) : from;
  const routeOpen = combatRouteOpen({ logistics: strategicLogistics, team, from: origin, to: destination });
  const logistics = combatLogisticsState({ territory, team, routeOpen });
  if (!logistics.connected) return .08;
  if (!logistics.hasOutpost && !logistics.hasDepot && !logistics.hasGarage) return .08;

  let endpoint = null;
  try { endpoint = strategicLogistics.getNode(destination); } catch {}
  const ammoStock = Math.max(0, Number(endpoint?.stock?.ammo) || 0);
  if (ammoStock <= 0) return .08;
  const ammoBand = clamp(ammoStock / 80, 0, 1);
  const supportBand = clamp(Number(logistics.reinforcementSupport) || 0, 0, 1);
  const stockedSupply = clamp(.12 + ammoBand * .58 + supportBand * .30, .08, 1);
  const routeThreat = knownPathThreat(strategicLogistics, team, origin, destination);
  const threatenedSupply = clamp(stockedSupply * (1 - routeThreat), .08, 1);
  const criticalFieldNode = logistics.hasDepot || logistics.hasGarage;
  if (criticalFieldNode && routeThreat > 0 && stockedSupply >= COMBAT_RECOVERY_THRESHOLDS.supply && threatenedSupply < COMBAT_OFFENSIVE_THRESHOLDS.supply) {
    return Math.max(threatenedSupply, COMBAT_RECOVERY_THRESHOLDS.supply);
  }
  return threatenedSupply;
}