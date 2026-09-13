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
      ? Math.max(canonical.intensity, clamp01(transmitted))
      : canonical.intensity;

  if (type !== 'critical') {
    if (intensity <= canonical.intensity) return Object.freeze({ ...canonical, intensity });
    // A stronger replicated intensity must be felt through the same physical
    // channels as a local hit, not only through a scalar consumed by one VFX.
    // Reuse the canonical hull model as the ceiling/floor source rather than
    // inventing a second set of shake/audio constants for remote impacts.
    const transmittedFloor = hullImpactFeedback({ damage: intensity * 20, kind: 'tank', inside: true });
    return Object.freeze({
      ...canonical,
      intensity,
      duration: Math.max(canonical.duration, transmittedFloor.duration),
      cameraShake: Math.max(canonical.cameraShake, transmittedFloor.cameraShake),
      hullFlash: Math.max(canonical.hullFlash, transmittedFloor.hullFlash),
      dustKick: Math.max(canonical.dustKick, transmittedFloor.dustKick),
      lampFlicker: Math.max(canonical.lampFlicker, transmittedFloor.lampFlicker),
      metalRattle: Math.max(canonical.metalRattle, transmittedFloor.metalRattle),
      lowThump: Math.max(canonical.lowThump, transmittedFloor.lowThump),
      sharpCrack: Math.max(canonical.sharpCrack, transmittedFloor.sharpCrack),
      label: transmittedFloor.label,
    });
  }

  // A replicated critical already means the authority classified the hit as a
  // severe hull event. Keep that classification perceptible across every
  // presentation channel instead of forcing only `intensity` to 1 while shake,
  // dust and audio still inherit a light payload such as damage=1/rifle.
  const criticalFloor = hullImpactFeedback({ damage: 20, kind: 'tank', inside: true });
  return Object.freeze({
    ...canonical,
    intensity: 1,
    duration: Math.max(canonical.duration, criticalFloor.duration),
    cameraShake: Math.max(canonical.cameraShake, criticalFloor.cameraShake),
    hullFlash: Math.max(canonical.hullFlash, criticalFloor.hullFlash),
    dustKick: Math.max(canonical.dustKick, criticalFloor.dustKick),
    lampFlicker: Math.max(canonical.lampFlicker, criticalFloor.lampFlicker),
    metalRattle: Math.max(canonical.metalRattle, criticalFloor.metalRattle),
    lowThump: Math.max(canonical.lowThump, criticalFloor.lowThump),
    sharpCrack: Math.max(canonical.sharpCrack, criticalFloor.sharpCrack),
    label: criticalFloor.label,
  });
}
