const EFFECT_INTERVAL = 0.28;

function maintenanceType(detail = {}) {
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
  if (!type || !Number.isFinite(nowSeconds)) return Object.freeze({ emit: null, state: previous || null });

  const progress = Number.isFinite(Number(detail.progress)) ? Math.max(0, Math.min(1, Number(detail.progress))) : 0;
  const prior = previous && typeof previous === 'object' ? previous : null;
  const changed = prior?.type !== type;
  const elapsed = nowSeconds - Number(prior?.at ?? -Infinity);
  const completed = progress >= 1 && Number(prior?.progress ?? 0) < 1;

  if (!changed && !completed && elapsed < EFFECT_INTERVAL) {
    return Object.freeze({ emit: null, state: prior });
  }

  const state = Object.freeze({ type, at: nowSeconds, progress });
  return Object.freeze({ emit: Object.freeze({ type, payload: Object.freeze({ progress }) }), state });
}

export const MAINTENANCE_EFFECT_INTERVAL = EFFECT_INTERVAL;
