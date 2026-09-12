import { hullImpactFeedback } from './cabin-hit-feedback.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * Normalizes replicated Mamute impact events into the same presentation
 * contract used by local cabin hits. Network/runtime authority stays outside
 * this module; it only derives visual/audio intensity for the local cabin.
 */
export function remoteHullImpactFeedback(effect = {}) {
  const type = String(effect?.type || '');
  if (type !== 'impact' && type !== 'critical') return null;

  const payload = effect?.payload && typeof effect.payload === 'object' ? effect.payload : {};
  const damageValue = Number(payload.damage);
  const damage = Number.isFinite(damageValue) ? damageValue : type === 'critical' ? 20 : 8;
  const kind = String(payload.kind || (type === 'critical' ? 'tank' : 'hit'));
  const canonical = hullImpactFeedback({ damage, kind, inside: true });
  const transmitted = Number(payload.intensity);
  const intensity = type === 'critical'
    ? 1
    : Number.isFinite(transmitted)
      ? clamp01(transmitted)
      : canonical.intensity;

  return Object.freeze({ ...canonical, intensity });
}
