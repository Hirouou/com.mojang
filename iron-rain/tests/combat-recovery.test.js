import test from 'node:test';
import assert from 'node:assert/strict';
import { combatRecoveryState } from '../modules/combat-recovery.js';

test('critical break thresholds still win over otherwise healthy logistics', () => {
  assert.deepEqual(combatRecoveryState({ strength: 22.9, morale: .8, suppression: .1, ammo: 1, supply: 1 }), { broken: true, recovered: false });
  assert.deepEqual(combatRecoveryState({ strength: 80, morale: .22, suppression: .1, ammo: 1, supply: 1 }), { broken: true, recovered: false });
  assert.deepEqual(combatRecoveryState({ strength: 80, morale: .8, suppression: .88, ammo: 1, supply: 1 }), { broken: true, recovered: false });
});

test('barely escaping break thresholds is not enough to leave regroup', () => {
  assert.deepEqual(combatRecoveryState({ strength: 24, morale: .24, suppression: .8, ammo: .8, supply: .8 }), { broken: false, recovered: false });
});

test('recovery requires combat readiness and local supply together', () => {
  assert.deepEqual(combatRecoveryState({ strength: 45, morale: .6, suppression: .3, ammo: .19, supply: .8 }), { broken: false, recovered: false });
  assert.deepEqual(combatRecoveryState({ strength: 45, morale: .6, suppression: .3, ammo: .8, supply: .19 }), { broken: false, recovered: false });
  assert.deepEqual(combatRecoveryState({ strength: 45, morale: .6, suppression: .3, ammo: .8, supply: .8 }), { broken: false, recovered: true });
});

test('invalid or missing inputs fail closed instead of authorizing an offensive return', () => {
  assert.deepEqual(combatRecoveryState({ strength: NaN, morale: .8, suppression: .1, ammo: 1, supply: 1 }), { broken: true, recovered: false });
  assert.deepEqual(combatRecoveryState(), { broken: true, recovered: false });
});
