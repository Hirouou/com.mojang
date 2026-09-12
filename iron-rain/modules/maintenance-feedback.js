/**
 * Pure presentation state for first-person engine maintenance.
 * Keeps UI/VFX decisions separate from engine damage rules.
 */
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function maintenanceFeedback(engine) {
  const action = engine?.action?.type;
  const health = Math.max(0, Math.min(100, Number.isFinite(engine?.health) ? engine.health : 100));
  const fire = clamp01(Number(engine?.fire) || 0);
  const duration = Math.max(.001, Number(engine?.action?.duration) || (action === 'extinguish' ? 3 : 6));
  const elapsed = Math.max(0, Number(engine?.action?.elapsed) || 0);
  const progress = action ? clamp01(elapsed / duration) : 0;

  if (action === 'extinguish') {
    return Object.freeze({
      active: true,
      kind: 'extinguish',
      progress,
      label: `EXTINTOR · ${Math.round(progress * 100)}%`,
      ring: progress,
      spray: .45 + fire * .55,
      sparks: 0,
      repairMotion: 0,
      dangerPulse: fire,
    });
  }

  if (action === 'repair') {
    return Object.freeze({
      active: true,
      kind: 'repair',
      progress,
      label: `REPARANDO · ${Math.round(progress * 100)}%`,
      ring: progress,
      spray: 0,
      sparks: .28 + .35 * Math.sin(progress * Math.PI),
      repairMotion: .55 + .45 * Math.sin(progress * Math.PI * 4) ** 2,
      dangerPulse: fire,
    });
  }

  if (fire > 0) {
    return Object.freeze({
      active: false,
      kind: 'fire',
      progress: 0,
      label: 'INCÊNDIO NO MOTOR',
      ring: 0,
      spray: 0,
      sparks: .12,
      repairMotion: 0,
      dangerPulse: fire,
    });
  }

  if (health < 100) {
    return Object.freeze({
      active: false,
      kind: 'damaged',
      progress: 0,
      label: `MOTOR AVARIADO · ${Math.round(health)}%`,
      ring: 0,
      spray: 0,
      sparks: 0,
      repairMotion: 0,
      dangerPulse: 0,
    });
  }

  return Object.freeze({
    active: false,
    kind: 'ready',
    progress: 1,
    label: 'MOTOR OPERACIONAL',
    ring: 0,
    spray: 0,
    sparks: 0,
    repairMotion: 0,
    dangerPulse: 0,
  });
}
