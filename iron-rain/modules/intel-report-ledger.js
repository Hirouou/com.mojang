/**
 * Snapshot-only storage for reports already earned through radio/recon.
 * The ledger never receives or retains combat entities; callers pass plain
 * observations captured at report time so later UI cannot query live state.
 */
const finite = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const clamp01 = value => Math.max(0, Math.min(1, value));

export function snapshotIntelObservation(observation, reportedAt = 0) {
  const id = observation?.id;
  const x = finite(observation?.x);
  const y = finite(observation?.y);
  const time = finite(reportedAt);
  if (id === null || id === undefined || x === null || y === null || time === null) return null;

  const sourceX = finite(observation?.sourcePos?.x);
  const sourceY = finite(observation?.sourcePos?.y);
  const sourcePos = sourceX === null || sourceY === null
    ? null
    : Object.freeze({ x: sourceX, y: sourceY });

  const routeId = observation?.routeId;
  const routeThreat = finite(observation?.routeThreat);
  const routeIntel = routeId === null || routeId === undefined || String(routeId).length === 0 || routeThreat === null
    ? null
    : Object.freeze({ routeId: String(routeId), routeThreat: clamp01(routeThreat) });

  return Object.freeze({
    id: String(id),
    type: String(observation?.type ?? 'CONTATO'),
    x,
    y,
    reportedAt: time,
    source: String(observation?.source ?? 'Rádio'),
    sourcePos,
    ...(routeIntel || {})
  });
}

/**
 * Upsert one immutable report by stable id. The returned array is a new frozen
 * ledger, so no consumer can mutate a prior snapshot in place.
 */
export function upsertIntelReport(reports, observation, reportedAt = 0) {
  const report = snapshotIntelObservation(observation, reportedAt);
  const current = Array.isArray(reports) ? reports : [];
  if (!report) return Object.freeze([...current]);
  const index = current.findIndex(item => String(item?.id) === report.id);
  if (index < 0) return Object.freeze([...current, report]);
  const next = [...current];
  next[index] = report;
  return Object.freeze(next);
}

/** Stable bookkeeping for discovery without storing a live target reference. */
export function knownTargetIds(reports) {
  const ids = [];
  for (const report of Array.isArray(reports) ? reports : []) {
    const id = report?.id;
    if (id === null || id === undefined) continue;
    const stable = String(id);
    if (!ids.includes(stable)) ids.push(stable);
  }
  return Object.freeze(ids);
}
