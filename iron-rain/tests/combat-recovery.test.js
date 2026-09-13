import test from 'node:test';
import assert from 'node:assert/strict';
import { combatRecoveryPhase, combatRecoveryState } from '../modules/combat-recovery.js';

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

test('phase gate keeps regroup until the healthier recovery band is fully satisfied', () => {
  const base = { phase: 'regroup', strength: 45, morale: .6, suppression: .3, ammo: .8, supply: .8 };
  assert.equal(combatRecoveryPhase({ ...base, morale: .31 }), 'regroup', 'morale below recovery band holds regroup');
  assert.equal(combatRecoveryPhase({ ...base, suppression: .66 }), 'regroup', 'suppression above recovery band holds regroup');
  assert.equal(combatRecoveryPhase({ ...base, ammo: .19 }), 'regroup', 'low ammo holds regroup');
  assert.equal(combatRecoveryPhase({ ...base, supply: .19 }), 'regroup', 'low local supply holds regroup');
  assert.equal(combatRecoveryPhase(base), null, 'fully recovered formation returns control to the normal phase selector');
});

test('phase gate preserves deterministic retreat to regroup while new breaks retreat immediately', () => {
  const healthy = { strength: 45, morale: .6, suppression: .3, ammo: .8, supply: .8 };
  assert.equal(combatRecoveryPhase({ phase: 'retreat', ...healthy }), 'regroup');
  assert.equal(combatRecoveryPhase({ phase: 'assault', ...healthy, morale: .2 }), 'retreat');
  assert.equal(combatRecoveryPhase({ phase: 'hold', ...healthy }), null);
});

test('healthy formations wait for support instead of launching low-supply assaults', () => {
  const healthy = { strength: 55, morale: .7, suppression: .2, ammo: .8 };
  for (const phase of ['hold', 'suppress', 'wait_support', 'assault']) {
    assert.equal(combatRecoveryPhase({ phase, ...healthy, supply: .19 }), 'wait_support', `${phase} is supply-gated`);
  }
  assert.equal(combatRecoveryPhase({ phase: 'hold', ...healthy, supply: .3 }), null, 'the offensive supply band releases normal phase selection');
  assert.equal(combatRecoveryPhase({ phase: 'hold', ...healthy }), 'wait_support', 'missing supply fails closed for offensive readiness');
});

test('depleted formations withdraw before hard break when local supply is gone', () => {
  const base = { phase: 'hold', strength: 48, morale: .6, suppression: .3, ammo: .8, supply: .19 };
  assert.equal(combatRecoveryPhase({ ...base, ammo: .19 }), 'retreat', 'empty magazines plus failed supply trigger a withdrawal');
  assert.equal(combatRecoveryPhase({ ...base, morale: .31 }), 'retreat', 'shaken troops withdraw when failed supply cannot sustain the line');
  assert.equal(combatRecoveryPhase({ ...base, suppression: .66 }), 'retreat', 'pinned troops withdraw when failed supply cannot sustain the line');
  assert.equal(combatRecoveryPhase(base), 'wait_support', 'composed and armed troops may still hold for support');
});

test('staging formations do not counter-attack until morale, suppression, ammo and supply are all ready', () => {
  const base = { phase: 'hold', strength: 55, morale: .7, suppression: .2, ammo: .8, supply: .8 };
  assert.equal(combatRecoveryPhase({ ...base, morale: .37 }), 'hold', 'shaken formation stays in cover');
  assert.equal(combatRecoveryPhase({ ...base, suppression: .56 }), 'hold', 'pinned formation stays in cover');
  assert.equal(combatRecoveryPhase({ ...base, ammo: .31 }), 'wait_support', 'low ammunition blocks opportunistic advance');
  assert.equal(combatRecoveryPhase({ ...base, supply: .29 }), 'wait_support', 'weak logistics block opportunistic advance');
  assert.equal(combatRecoveryPhase(base), null, 'ready formation can return to the existing tactical selector');
});

test('active assaults stop when logistics or composure fall below offensive readiness', () => {
  const base = { phase: 'assault', strength: 55, morale: .7, suppression: .2, ammo: .8, supply: .8 };
  assert.equal(combatRecoveryPhase({ ...base, ammo: .31 }), 'wait_support', 'assault pauses when ammunition falls below the offensive band');
  assert.equal(combatRecoveryPhase({ ...base, supply: .29 }), 'wait_support', 'assault pauses when local supply falls below the offensive band');
  assert.equal(combatRecoveryPhase({ ...base, morale: .37 }), 'hold', 'assault falls back to cover when morale slips');
  assert.equal(combatRecoveryPhase({ ...base, suppression: .56 }), 'hold', 'assault falls back to cover when suppression rises');
  assert.equal(combatRecoveryPhase(base), null, 'ready assault remains under the existing tactical selector');
});

test('combat break precedence still forces retreat when supply is also exhausted', () => {
  assert.equal(combatRecoveryPhase({ phase: 'assault', strength: 55, morale: .2, suppression: .2, ammo: .8, supply: .1 }), 'retreat');
});
