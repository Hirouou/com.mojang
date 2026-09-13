import { combatLogisticsState, combatReserveOrigin, combatRouteOpen } from './combat-reserves.js';
import { COMBAT_OFFENSIVE_THRESHOLDS, COMBAT_RECOVERY_THRESHOLDS } from './combat-recovery.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const validTeam = team => team === 'ally' || team === 'enemy';

function knownPathThreat(strategicLogistics, team, from, to) {
  if (!strategicLogistics || typeof strategicLogistics.route !== 'function' || typeof strategicLogistics.snapshot !== 'function') return 0;
  const origin = String(from ?? ''), destination = String(to ?? '');
  if (!origin || !destination || origin === destination) return 0;
  try {
    const path = strategicLogistics.route(team, origin, destination);
    const routes = strategicLogistics.snapshot()?.routes;
    if (!Array.isArray(path) || !Array.isArray(routes)) return 0;
    const threatByRoute = new Map(routes.map(route => [String(route?.id ?? ''), clamp(Number(route?.knownThreat) || 0, 0, 1)]));
    return path.reduce((highest, leg) => Math.max(highest, threatByRoute.get(String(leg?.routeId ?? '')) || 0), 0);
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
  // Stock parked on a generic road/sector node is not frontline sustainment by
  // itself. A real field node must exist before tactical formations can turn
  // delivered ammunition into offensive supply; otherwise they fail closed and
  // wait for logistics instead of attacking from an undeveloped map point.
  if (!logistics.hasOutpost && !logistics.hasDepot && !logistics.hasGarage) return .08;

  let endpoint = null;
  try { endpoint = strategicLogistics.getNode(destination); } catch {}
  const ammoStock = Math.max(0, Number(endpoint?.stock?.ammo) || 0);
  if (ammoStock <= 0) return .08;
  const ammoBand = clamp(ammoStock / 80, 0, 1);
  const supportBand = clamp(Number(logistics.reinforcementSupport) || 0, 0, 1);
  const stockedSupply = clamp(.12 + ammoBand * .58 + supportBand * .30, .08, 1);
  // Threat only counts after strategic-logistics has accepted and aged the
  // faction's report. A dangerous known route therefore makes an otherwise
  // stocked line less willing to sustain assaults, while stale/unknown intel
  // naturally falls back to zero disruption in the canonical snapshot.
  const routeThreat = knownPathThreat(strategicLogistics, team, origin, destination);
  const threatenedSupply = clamp(stockedSupply * (1 - routeThreat), .08, 1);
  // A stocked depot/garage is itself a strategic objective. When earned intel
  // makes its route too dangerous for offensive readiness, preserve exactly the
  // existing recovery-supply floor so defenders can reorganize locally instead
  // of abandoning the node solely because the road is threatened. This does not
  // authorize an attack: the value remains below the existing offensive supply
  // threshold. A cut route or empty local stock still fails closed above.
  const criticalFieldNode = logistics.hasDepot || logistics.hasGarage;
  if (criticalFieldNode && routeThreat > 0 && stockedSupply >= COMBAT_RECOVERY_THRESHOLDS.supply && threatenedSupply < COMBAT_OFFENSIVE_THRESHOLDS.supply) {
    return Math.max(threatenedSupply, COMBAT_RECOVERY_THRESHOLDS.supply);
  }
  return threatenedSupply;
}
