import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_OFFENSIVE_THRESHOLDS, COMBAT_RECOVERY_THRESHOLDS, combatRecoveryPhase } from '../modules/combat-recovery.js';

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

test('active assault withdraws when offensive ammunition or supply readiness is lost', () => {
  const strength = COMBAT_RECOVERY_THRESHOLDS.strength + 12;
  assert.equal(combatRecoveryPhase({
    ...assault,
    strength,
    ammo: COMBAT_OFFENSIVE_THRESHOLDS.ammo - .01
  }), 'retreat');
  assert.equal(combatRecoveryPhase({
    ...assault,
    strength,
    supply: COMBAT_OFFENSIVE_THRESHOLDS.supply - .01
  }), 'retreat');
});

test('defensive line waits for support when the same offensive logistics band is missed', () => {
  const strength = COMBAT_RECOVERY_THRESHOLDS.strength + 12;
  assert.equal(combatRecoveryPhase({
    ...assault,
    phase: 'hold',
    strength,
    ammo: COMBAT_OFFENSIVE_THRESHOLDS.ammo - .01
  }), 'wait_support');
  assert.equal(combatRecoveryPhase({
    ...assault,
    phase: 'hold',
    strength,
    supply: COMBAT_OFFENSIVE_THRESHOLDS.supply - .01
  }), 'wait_support');
});
