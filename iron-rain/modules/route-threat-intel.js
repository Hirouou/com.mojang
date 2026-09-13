import { assessIntelAge } from './intel-knowledge.js';

/**
 * Feed only already-earned, immutable route observations into strategic
 * logistics. This adapter never discovers a route threat from live world state;
 * observers/recon/radio must have captured routeId + routeThreat in the ledger.
 */
export function applyRouteThreatIntel(logistics, reports, { team, now = 0 } = {}) {
  if (!logistics || typeof logistics.reportRouteThreat !== 'function') return 0;
  if (!['ally', 'enemy'].includes(team) || !Number.isFinite(Number(now))) return 0;

  let applied = 0;
  for (const report of Array.isArray(reports) ? reports : []) {
    const routeId = report?.routeId;
    const threat = Number(report?.routeThreat);
    const reportedAt = Number(report?.reportedAt);
    if (routeId === null || routeId === undefined || String(routeId).length === 0) continue;
    if (!Number.isFinite(threat) || !Number.isFinite(reportedAt)) continue;

    const state = assessIntelAge({ reportedAt }, Number(now)).state;
    if (state !== 'fresh' && state !== 'aging') continue;

    if (logistics.reportRouteThreat(String(routeId), { team, threat, reportedAt })) applied += 1;
  }
  return applied;
}
