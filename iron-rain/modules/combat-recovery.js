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

export const COMBAT_OFFENSIVE_THRESHOLDS = Object.freeze({
  morale: 0.38,
  suppression: 0.55,
  ammo: 0.32,
  supply: 0.3
});

const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
const SUPPLY_GATED_PHASES = new Set(['hold', 'suppress', 'wait_support', 'assault']);
const OFFENSIVE_PHASES = new Set(['hold', 'suppress', 'wait_support', 'assault']);

/**
 * Shared offensive readiness predicate. This is deliberately stricter than
 * the hard break thresholds: surviving a line is not the same as being fit to
 * launch or continue an attack. Missing values fail closed.
 */
export function combatOffensiveReady({ morale, suppression, ammo, supply } = {}) {
  const moraleValue = finiteOr(morale, 0);
  const suppressionValue = finiteOr(suppression, 1);
  const ammoValue = finiteOr(ammo, 0);
  const supplyValue = finiteOr(supply, 0);
  return moraleValue >= COMBAT_OFFENSIVE_THRESHOLDS.morale &&
    suppressionValue <= COMBAT_OFFENSIVE_THRESHOLDS.suppression &&
    ammoValue >= COMBAT_OFFENSIVE_THRESHOLDS.ammo &&
    supplyValue >= COMBAT_OFFENSIVE_THRESHOLDS.supply;
}

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
 * Recovery/readiness phase gate. A caller can apply this before its normal
 * tactical phase selector: `null` means ordinary phase selection may continue.
 *
 * Once a formation reaches regroup it stays there until the healthier recovery
 * band is satisfied. Outside retreat/regroup, a formation with exhausted or
 * unknown local supply waits for support while it still has enough composure to
 * hold. If that same supply failure is paired with empty magazines, weak morale
 * or heavy suppression, the formation withdraws before crossing the hard break
 * threshold. A formation that is both shaken and heavily suppressed, depleted
 * and heavily suppressed, or depleted and shaken also withdraws early even with
 * supply available instead of unrealistically sitting in the line until one
 * hard-break threshold is crossed. Offensive phases also require a modest
 * readiness band, preventing tired or pinned squads from launching or sustaining
 * attacks. Once an assault is in close contact, crossing either recovery
 * composure threshold is enough to withdraw rather than treating the formation
 * like a stationary defender.
 */
export function combatRecoveryPhase({ phase, strength, morale, suppression, ammo, supply } = {}) {
  const recovery = combatRecoveryState({ strength, morale, suppression, ammo, supply });
  if (phase === 'regroup') return recovery.recovered ? null : 'regroup';
  if (phase === 'retreat') return 'regroup';
  if (recovery.broken) return 'retreat';

  const strengthValue = finiteOr(strength, 0);
  const supplyValue = finiteOr(supply, 0);
  const ammoValue = finiteOr(ammo, 0);
  const moraleValue = finiteOr(morale, 0);
  const suppressionValue = finiteOr(suppression, 1);
  const cohesionWithdrawal = moraleValue < COMBAT_RECOVERY_THRESHOLDS.morale &&
    suppressionValue > COMBAT_RECOVERY_THRESHOLDS.suppression;
  const attritionWithdrawal = strengthValue < COMBAT_RECOVERY_THRESHOLDS.strength &&
    suppressionValue > COMBAT_RECOVERY_THRESHOLDS.suppression;
  const shatteredWithdrawal = strengthValue < COMBAT_RECOVERY_THRESHOLDS.strength &&
    moraleValue < COMBAT_RECOVERY_THRESHOLDS.morale;
  if ((cohesionWithdrawal || attritionWithdrawal || shatteredWithdrawal) && SUPPLY_GATED_PHASES.has(phase)) return 'retreat';

  const supplied = supplyValue >= COMBAT_RECOVERY_THRESHOLDS.supply;
  if (!supplied && SUPPLY_GATED_PHASES.has(phase)) {
    const withdrawalPressure = ammoValue < COMBAT_RECOVERY_THRESHOLDS.ammo ||
      moraleValue < COMBAT_RECOVERY_THRESHOLDS.morale ||
      suppressionValue > COMBAT_RECOVERY_THRESHOLDS.suppression;
    return withdrawalPressure ? 'retreat' : 'wait_support';
  }

  if (OFFENSIVE_PHASES.has(phase) && !combatOffensiveReady({ morale, suppression, ammo, supply })) {
    const logisticsReady = ammoValue >= COMBAT_OFFENSIVE_THRESHOLDS.ammo && supplyValue >= COMBAT_OFFENSIVE_THRESHOLDS.supply;
    const assaultWithdrawal = phase === 'assault' && (
      moraleValue < COMBAT_RECOVERY_THRESHOLDS.morale ||
      suppressionValue > COMBAT_RECOVERY_THRESHOLDS.suppression
    );
    if (assaultWithdrawal) return 'retreat';
    return logisticsReady ? 'hold' : 'wait_support';
  }
  return null;
}