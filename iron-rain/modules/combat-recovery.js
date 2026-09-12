export const COMBAT_BREAK_THRESHOLDS = Object.freeze({
  strength: 23,
  morale: 0.23,
  suppression: 0.87
});

export const COMBAT_RECOVERY_THRESHOLDS = Object.freeze({
  strength: 28,
  morale: 0.32,
  suppression: 0.65,
  ammo: 0.2,
  supply: 0.2
});

const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;

/**
 * Pure recovery policy for aggregate infantry forces.
 *
 * Breaking uses the current hard limits. Returning from regroup deliberately
 * requires a healthier band so a formation does not bounce back into combat
 * as soon as it barely crosses one threshold. Ammo and local supply are part
 * of recovery readiness, but never make a critically broken formation ready.
 */
export function combatRecoveryState({ strength, morale, suppression, ammo, supply } = {}) {
  const values = {
    strength: finiteOr(strength, 0),
    morale: finiteOr(morale, 0),
    suppression: finiteOr(suppression, 1),
    ammo: finiteOr(ammo, 0),
    supply: finiteOr(supply, 0)
  };
  const broken = values.strength < COMBAT_BREAK_THRESHOLDS.strength ||
    values.morale < COMBAT_BREAK_THRESHOLDS.morale ||
    values.suppression > COMBAT_BREAK_THRESHOLDS.suppression;
  const recovered = !broken &&
    values.strength >= COMBAT_RECOVERY_THRESHOLDS.strength &&
    values.morale >= COMBAT_RECOVERY_THRESHOLDS.morale &&
    values.suppression <= COMBAT_RECOVERY_THRESHOLDS.suppression &&
    values.ammo >= COMBAT_RECOVERY_THRESHOLDS.ammo &&
    values.supply >= COMBAT_RECOVERY_THRESHOLDS.supply;
  return Object.freeze({ broken, recovered });
}

/**
 * Recovery-only phase gate. A caller can apply this before its normal tactical
 * phase selector: `null` means ordinary phase selection may continue.
 *
 * Once a formation reaches regroup it stays there until the healthier recovery
 * band is satisfied. This gives reinforcements, morale, suppression, ammo and
 * local logistics time to matter instead of cycling retreat/regroup by timer.
 */
export function combatRecoveryPhase({ phase, strength, morale, suppression, ammo, supply } = {}) {
  const recovery = combatRecoveryState({ strength, morale, suppression, ammo, supply });
  if (phase === 'regroup') return recovery.recovered ? null : 'regroup';
  if (phase === 'retreat') return 'regroup';
  if (recovery.broken) return 'retreat';
  return null;
}
