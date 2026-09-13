import test from 'node:test';
import assert from 'node:assert/strict';
import { loaderRigState } from '../modules/loader-arm.js';

test('loader rig approaches empty, then keeps the visible transfer shell owned by the claw', () => {
  const approach = loaderRigState({ progress: .1, phase: 'extract' });
  assert.equal(approach.active, true);
  assert.equal(approach.shell.visible, false);
  assert.equal(approach.shell.owner, null);
  assert.equal(approach.shell.clamped, false);

  const closing = loaderRigState({ progress: .14, phase: 'extract' });
  assert.equal(closing.active, true);
  assert.equal(closing.shell.visible, false, 'round stays in the carousel while the claw is still closing');
  assert.equal(closing.shell.owner, null);
  assert.equal(closing.shell.clamped, false);

  for (const cycle of [
    { progress: .17, phase: 'extract' },
    { progress: .45, phase: 'rotate' },
    { progress: .8, phase: 'ram' },
    { progress: .91, phase: 'lock' },
  ]) {
    const state = loaderRigState(cycle);
    assert.equal(state.active, true);
    assert.equal(state.shell.visible, true);
    assert.equal(state.shell.owner, 'claw');
    assert.equal(state.shell.clamped, true);
    assert.equal(state.shell.seated, false);
  }
});

test('loader rig releases the carried shell when final lock opens the claw', () => {
  const released = loaderRigState({ progress: .925, phase: 'lock' });
  assert.equal(released.shell.visible, false);
  assert.equal(released.shell.owner, null);
  assert.equal(released.shell.clamped, false);
  assert.equal(released.shell.seated, false);

  const hidden = loaderRigState({ progress: .95, phase: 'lock' });
  assert.equal(hidden.shell.visible, false);
  assert.equal(hidden.shell.owner, null);
  assert.equal(hidden.shell.clamped, false);
  assert.equal(hidden.shell.seated, false);
});

test('loader rig is frozen and idle state exposes no shell owner', () => {
  const idle = loaderRigState(null);
  assert.equal(idle.active, false);
  assert.equal(idle.phase, 'idle');
  assert.equal(idle.shell.visible, false);
  assert.equal(idle.shell.owner, null);
  assert.ok(Object.isFrozen(idle));
  assert.ok(Object.isFrozen(idle.joints));
  assert.ok(Object.isFrozen(idle.shell));
});