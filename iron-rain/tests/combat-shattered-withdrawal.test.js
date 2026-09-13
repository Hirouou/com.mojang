import test from 'node:test';
import assert from 'node:assert/strict';
import { combatRecoveryPhase } from '../modules/combat-recovery.js';

test('depleted and shaken formations withdraw before hard break even when fire slackens', () => {
  const base = { strength: 27.9, morale: .31, suppression: .3, ammo: .8, supply: .8 };

  for (const phase of ['hold', 'suppress', 'wait_support', 'assault']) {
    assert.equal(
      combatRecoveryPhase({ phase, ...base }),
      'retreat',
      `${phase} withdraws when attrition and morale are both below recovery`
    );
  }

  assert.equal(
    combatRecoveryPhase({ ...base, phase: 'hold', strength: 28 }),
    'hold',
    'recovery strength removes the shattered-formation withdrawal'
  );
  assert.equal(
    combatRecoveryPhase({ ...base, phase: 'hold', morale: .32 }),
    'hold',
    'recovery morale removes the shattered-formation withdrawal'
  );
});
