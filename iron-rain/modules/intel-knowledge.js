/**
 * Faction knowledge helpers for reports already received through radio/recon.
 * This module never discovers entities by itself; callers must only pass reports
 * the faction legitimately knows about.
 */
export const INTEL_AGE_LIMITS = Object.freeze({ fresh: 90, aging: 300, lost: 900 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Return a presentation-safe confidence state for one known report.
 * Age is measured in simulated seconds since the observation was recorded.
 */
export function assessIntelAge(report, now = 0) {
  const rawObservedAt = report?.reportedAt;
  const observedAt = rawObservedAt === null || rawObservedAt === undefined ? NaN : Number(rawObservedAt);
  const current = Number(now);
  if (!Number.isFinite(observedAt) || !Number.isFinite(current)) {
    return Object.freeze({ age: Infinity, state: 'lost', confidence: 0, uncertainty: 1200 });
  }
  const age = Math.max(0, current - observedAt);
  if (age <= INTEL_AGE_LIMITS.fresh) {
    return Object.freeze({ age, state: 'fresh', confidence: 1, uncertainty: 0 });
  }
  if (age <= INTEL_AGE_LIMITS.aging) {
    const t = (age - INTEL_AGE_LIMITS.fresh) / (INTEL_AGE_LIMITS.aging - INTEL_AGE_LIMITS.fresh);
    return Object.freeze({ age, state: 'aging', confidence: 1 - t * .45, uncertainty: Math.round(80 + t * 220) });
  }
  if (age <= INTEL_AGE_LIMITS.lost) {
    const t = (age - INTEL_AGE_LIMITS.aging) / (INTEL_AGE_LIMITS.lost - INTEL_AGE_LIMITS.aging);
    return Object.freeze({ age, state: 'stale', confidence: .55 - t * .4, uncertainty: Math.round(300 + t * 900) });
  }
  return Object.freeze({ age, state: 'lost', confidence: 0, uncertainty: 1200 });
}

/** Human-readable labels for map/radio UI; deliberately avoid claiming live contact. */
export function intelAgeLabel(report, now = 0) {
  const intel = assessIntelAge(report, now);
  if (intel.state === 'fresh') return 'CONTATO RECENTE';
  if (intel.state === 'aging') return `INFORME ENVELHECENDO · ±${intel.uncertainty} m`;
  if (intel.state === 'stale') return `POSIÇÃO ANTIGA · ±${intel.uncertainty} m`;
  return 'CONTATO PERDIDO';
}

/**
 * Whether an exact marker may still be rendered. Stale/lost reports should use
 * uncertainty or textual references instead of pretending the target is live.
 */
export function exactMarkerAllowed(report, now = 0) {
  const state = assessIntelAge(report, now).state;
  return state === 'fresh' || state === 'aging';
}

/**
 * Produce a map-safe disclosure for already-known intel. This does not discover
 * anything: it only limits what a renderer may expose from a legitimate report.
 * Fresh/aging reports may use their recorded point, stale reports become an
 * uncertainty area around the historical point, and lost reports deliberately
 * drop coordinates so a future map cannot accidentally resurrect exact contact.
 */
export function mapIntelDisclosure(report, now = 0) {
  const intel = assessIntelAge(report, now);
  const x = Number(report?.x);
  const y = Number(report?.y);
  const hasPoint = Number.isFinite(x) && Number.isFinite(y);
  const mode = intel.state === 'lost' ? 'lost' : exactMarkerAllowed(report, now) && hasPoint ? 'exact' : hasPoint ? 'area' : 'lost';
  return Object.freeze({
    mode,
    state: intel.state,
    label: intelAgeLabel(report, now),
    confidence: intel.confidence,
    uncertainty: intel.uncertainty,
    x: mode === 'lost' ? null : x,
    y: mode === 'lost' ? null : y
  });
}
