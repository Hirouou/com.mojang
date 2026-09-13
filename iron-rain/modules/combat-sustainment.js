import { combatLogisticsState, combatReserveOrigin, combatRouteOpen } from './combat-reserves.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const validTeam = team => team === 'ally' || team === 'enemy';

/**
 * Read-only sustainment cap for tactical combat. The strategic logistics graph
 * remains authoritative for route reachability and stock; combat AI only turns
 * that existing state into the same abstract 0..1 supply scale already used by
 * the tactical simulator. No stock is created or consumed here.
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
  return clamp(.12 + ammoBand * .58 + supportBand * .30, .08, 1);
}
