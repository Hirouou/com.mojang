const EFFECT_INTERVAL = 0.28;

function maintenanceType(detail = {}) {
  // The canonical producer is maintenanceFeedback(), which publishes
  // { active, kind, progress }. Keep the older aliases as compatibility for
  // any in-flight presentation caller while the live integration converges.
  if (detail.active === true && detail.kind === 'extinguish') return 'extinguisher';
  if (detail.active === true && detail.kind === 'repair') return 'repair';
  if (detail.extinguisherActive || detail.action === 'extinguish') return 'extinguisher';
  if (detail.repairActive || detail.action === 'repair') return 'repair';
  return null;
}

/**
 * Bounds replicated maintenance feedback so frame-rate progress events do not
 * become dozens of remote WebAudio transients per second. This owns no
 * gameplay timer: callers provide the current monotonic time and keep the
 * returned tiny presentation state.
 */
export function maintenanceEffectCadence(previous, detail, nowSeconds) {
  const type = maintenanceType(detail);
  if (!type || !Number.isFinite(nowSeconds)) {
    // Canonical inactive feedback marks the end/interruption of an action.
    // Clearing presentation state lets a fast restart of the same tool emit an
    // immediate cue instead of being swallowed by the previous cadence window.
    const state = detail?.active === false ? null : (previous || null);
    return Object.freeze({ emit: null, state });
  }

  const progress = Number.isFinite(Number(detail.progress)) ? Math.max(0, Math.min(1, Number(detail.progress))) : 0;
  const remote = detail?.remote === true;
  const prior = previous && typeof previous === 'object' ? previous : null;
  const changed = prior?.type !== type || Boolean(prior?.remote) !== remote;
  const priorAt = Number(prior?.at);
  const clockReset = Number.isFinite(priorAt) && nowSeconds < priorAt;
  const elapsed = clockReset ? Infinity : nowSeconds - (Number.isFinite(priorAt) ? priorAt : -Infinity);
  const completed = progress >= 1 && Number(prior?.progress ?? 0) < 1;

  // Presentation clocks can restart after reconnects, scene resets or browser
  // lifecycle changes. Treat a backwards clock as a new cadence window rather
  // than suppressing feedback until the old timestamp is reached again.
  // Local/remote source changes are also semantic transitions: do not let a
  // same-tool cadence window swallow the first audible cue from another crew
  // member (or the operator taking the tool back).
  if (!changed && !completed && !clockReset && elapsed < EFFECT_INTERVAL) {
    return Object.freeze({ emit: null, state: prior });
  }

  const state = Object.freeze({ type, at: nowSeconds, progress, remote });
  return Object.freeze({ emit: Object.freeze({ type, payload: Object.freeze({ progress, remote }) }), state });
}

export const MAINTENANCE_EFFECT_INTERVAL = EFFECT_INTERVAL;