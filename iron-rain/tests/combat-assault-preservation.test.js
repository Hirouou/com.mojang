import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_RECOVERY_THRESHOLDS, combatRecoveryPhase } from '../modules/combat-recovery.js';

const assault = {
  phase: 'assault',
  morale: .72,
  suppression: .18,
  ammo: .8,
  supply: .8
};

test('active assault preserves a depleted formation before the hard break line', () => {
  const depleted = COMBAT_RECOVERY_THRESHOLDS.strength - .1;
  assert.equal(combatRecoveryPhase({ ...assault, strength: depleted }), 'retreat');
});

test('recovery-strength formation can keep using the existing tactical selector', () => {
  assert.equal(combatRecoveryPhase({ ...assault, strength: COMBAT_RECOVERY_THRESHOLDS.strength }), null);
});

test('the same depleted strength keeps a composed defensive line in cover instead of counter-attacking', () => {
  const depleted = COMBAT_RECOVERY_THRESHOLDS.strength - .1;
  assert.equal(combatRecoveryPhase({ ...assault, phase: 'hold', strength: depleted }), 'hold');
});
