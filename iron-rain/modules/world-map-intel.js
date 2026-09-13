import { hexControl, neighboringHexIds } from './strategic-hex-map.js';
import { assessIntelAge } from './intel-knowledge.js';

const dist = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));

const hasFriendlyRadio = (hex, team) => (hex?.sectors || []).some(sector => sector.owner === team && (sector.radio || (sector.structures || []).includes('radio')));

const reportObservedAt = report => report?.reportedAt ?? report?.time;
const sectorReportKey = (hexId, sectorId) => `${hexId}:${sectorId}`;

function reportIntelState(report, now) {
  if (!Number.isFinite(Number(now))) return 'fresh';
  return assessIntelAge({ reportedAt: reportObservedAt(report) }, Number(now)).state;
}

function newestReport(current, candidate) {
  if (!candidate) return current || null;
  if (!current) return candidate;
  return Number(reportObservedAt(candidate)) > Number(reportObservedAt(current)) ? candidate : current;
}

/** Friendly radio sites expose their own front and neighboring front situation. */
export function radioVisibleHexIds(hexes, team) {
  if (!Array.isArray(hexes) || !['ally', 'enemy'].includes(team)) return Object.freeze([]);
  const visible = new Set();
  for (const hex of hexes) {
    if (!hasFriendlyRadio(hex, team)) continue;
    visible.add(hex.id);
    for (const neighbor of neighboringHexIds(hex, hexes)) visible.add(neighbor);
  }
  return Object.freeze([...visible]);
}

/**
 * Strategic map snapshot: friendly controlled territory is known, but remote
 * front activity only carries detail when a friendly radio/recon source exists.
 * Enemy-side sectors never become an omniscient live minimap.
 *
 * When `now` is supplied, reports use the shared intel-age policy. Lost reports
 * no longer keep remote hostile control live forever; stale reports remain only
 * as historical contact rather than current front disclosure. Sector-scoped
 * reports disclose only the observed sector; a coarse hex report is required to
 * disclose the whole remote hex.
 */
export function createWorldMapIntel({ hexes = [], team = 'ally', playerPosition = null, reports = [], now = null } = {}) {
  const radioVisible = new Set(radioVisibleHexIds(hexes, team));
  const reportsByHex = new Map();
  const reportsBySector = new Map();
  for (const report of reports || []) {
    if (!report?.hexId) continue;
    if (report.sectorId) {
      const key = sectorReportKey(report.hexId, report.sectorId);
      reportsBySector.set(key, newestReport(reportsBySector.get(key), report));
      continue;
    }
    reportsByHex.set(report.hexId, newestReport(reportsByHex.get(report.hexId), report));
  }

  return Object.freeze(hexes.map(hex => {
    const control = hexControl(hex);
    const friendly = control === team;
    const local = playerPosition ? dist(playerPosition, hex) <= (hex.radius || 6_200) * 1.45 : false;
    const radio = radioVisible.has(hex.id);
    const report = reportsByHex.get(hex.id) || null;
    const reportState = report ? reportIntelState(report, now) : 'lost';
    const liveReport = Boolean(report) && (reportState === 'fresh' || reportState === 'aging');
    const staleReport = Boolean(report) && reportState === 'stale';
    let newestSectorReport = null;
    let hasLiveSectorReport = false;
    let hasStaleSectorReport = false;
    const sectors = hex.sectors.map(sector => {
      const sectorReport = reportsBySector.get(sectorReportKey(hex.id, sector.id)) || null;
      if (sectorReport) newestSectorReport = newestReport(newestSectorReport, sectorReport);
      const sectorReportState = sectorReport ? reportIntelState(sectorReport, now) : 'lost';
      const liveSectorReport = Boolean(sectorReport) && (sectorReportState === 'fresh' || sectorReportState === 'aging');
      const staleSectorReport = Boolean(sectorReport) && sectorReportState === 'stale';
      hasLiveSectorReport ||= liveSectorReport;
      hasStaleSectorReport ||= staleSectorReport;
      const sectorHasIntel = local || radio || liveReport || liveSectorReport;
      return Object.freeze({
        id: sector.id,
        name: sector.name,
        owner: friendly || local ? sector.owner : sector.owner === team ? team : sectorHasIntel ? 'reported-hostile-or-contested' : 'unknown',
        radio: sector.owner === team ? Boolean(sector.radio || (sector.structures || []).includes('radio')) : false,
      });
    });
    const coarseIntel = local || radio || liveReport;
    const latestReport = newestReport(report, newestSectorReport);
    return Object.freeze({
      id: hex.id, name: hex.name, x: hex.x, y: hex.y,
      control: friendly || local ? control : coarseIntel ? (control === team ? team : 'reported') : 'unknown',
      frontDetail: local ? 'local' : radio ? 'radio' : liveReport || hasLiveSectorReport ? 'report' : staleReport || hasStaleSectorReport ? 'report-stale' : 'none',
      lastReportTime: reportObservedAt(latestReport) ?? null,
      sectors: Object.freeze(sectors),
    });
  }));
}
