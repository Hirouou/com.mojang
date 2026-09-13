import { maintenanceFeedback } from './maintenance-feedback.js';

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));

/**
 * Rebuilds the same presentation contract used by local maintenance from the
 * compact replicated payload. This keeps remote foam/sparks/tool motion on the
 * canonical maintenanceFeedback() curves instead of inventing parallel VFX
 * tuning in the multiplayer consumer.
 */
export function remoteMaintenanceFeedback(kind, progress) {
  const action = kind === 'extinguisher' ? 'extinguish' : kind;
  if (action !== 'extinguish' && action !== 'repair') return null;
  const normalizedProgress = clamp01(progress);
  const feedback = maintenanceFeedback({
    health: 100,
    fire: 0,
    action: { type: action, elapsed: normalizedProgress, duration: 1 },
  });
  return Object.freeze({ ...feedback, remote: true });
}
