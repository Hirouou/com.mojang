import test from 'node:test';
import assert from 'node:assert/strict';
import { combatRecoveryPhase } from '../modules/combat-recovery.js';

const healthy = Object.freeze({ strength: 64, morale: .72, suppression: .18, ammo: .74 });

test('cut-off consolidation pauses for support instead of fortifying on phantom supply', () => {
  assert.equal(combatRecoveryPhase({ phase: 'consolidate', ...healthy, supply: .19 }), 'wait_support');
  assert.equal(combatRecoveryPhase({ phase: 'consolidate', ...healthy, supply: .20 }), null);
});

test('cut-off consolidation retreats when the captured line is also depleted', () => {
  assert.equal(combatRecoveryPhase({ phase: 'consolidate', ...healthy, ammo: .19, supply: .19 }), 'retreat');
  assert.equal(combatRecoveryPhase({ phase: 'consolidate', ...healthy, morale: .31, suppression: .66, supply: .8 }), 'retreat');
});
