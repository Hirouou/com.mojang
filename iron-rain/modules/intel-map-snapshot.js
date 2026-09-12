import { mapIntelDisclosure } from './intel-knowledge.js';

/**
 * Convert an already-earned intel ledger into renderer-safe map entries.
 * This helper never discovers targets or receives live combat entities; it only
 * composes immutable report snapshots with the age/disclosure policy.
 */
export function buildIntelMapSnapshot(reports, now = 0) {
  const current = Number(now);
  if (!Number.isFinite(current)) return Object.freeze([]);
  const entries = [];
  for (const report of Array.isArray(reports) ? reports : []) {
    const id = report?.id;
    const reportedAt = Number(report?.reportedAt);
    if (id === null || id === undefined || !Number.isFinite(reportedAt)) continue;
    const disclosure = mapIntelDisclosure(report, current);
    entries.push(Object.freeze({
      id: String(id),
      type: String(report?.type ?? 'CONTATO'),
      source: String(report?.source ?? 'Rádio'),
      reportedAt,
      mode: disclosure.mode,
      state: disclosure.state,
      label: disclosure.label,
      confidence: disclosure.confidence,
      uncertainty: disclosure.uncertainty,
      x: disclosure.x,
      y: disclosure.y
    }));
  }
  return Object.freeze(entries);
}
