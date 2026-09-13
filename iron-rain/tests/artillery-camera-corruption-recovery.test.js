import test from 'node:test';
import assert from 'node:assert/strict';
import { beginReturn, cameraAnchor, stepCamera } from '../modules/camera-director.js';

const stateWithCorruptCamera = () => ({
  robot: { x: 1800, y: 950 },
  cam: {
    x: Number.NaN,
    y: Number.POSITIVE_INFINITY,
    zoom: 1.25,
    mode: 'impact',
    manualX: 80,
    manualY: -45,
    elapsed: 0,
  },
  returning: false,
  impactHold: 0,
});

test('artillery return repairs non-finite projectile camera coordinates from the Mamute anchor', () => {
  const state = stateWithCorruptCamera();
  beginReturn(state);
  stepCamera(state, 0.1, 1000);

  const anchor = cameraAnchor(state, 1000);
  assert.equal(state.cam.mode, 'follow');
  assert.equal(state.returning, false);
  assert.equal(Number.isFinite(state.cam.x), true);
  assert.equal(Number.isFinite(state.cam.y), true);
  assert.deepEqual({ x: state.cam.x, y: state.cam.y }, anchor);
  assert.equal(state.cam.manualX, 0);
  assert.equal(state.cam.manualY, 0);
});

test('one corrupted camera axis does not contaminate the valid return axis', () => {
  const state = stateWithCorruptCamera();
  state.cam.x = 5200;
  beginReturn(state);
  stepCamera(state, 0.1, 1000);

  assert.equal(Number.isFinite(state.cam.x), true);
  assert.equal(Number.isFinite(state.cam.y), true);
  assert.equal(state.cam.x < 5200, true);
  assert.equal(state.cam.y, state.robot.y);
});

test('invalid impact hold cannot trap the projectile camera away from the Mamute', () => {
  for (const impactHold of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const state = stateWithCorruptCamera();
    state.cam.x = 5400;
    state.cam.y = 1400;
    state.impactHold = impactHold;

    stepCamera(state, 0.016, 1000);

    assert.equal(state.cam.mode, 'return');
    assert.equal(state.returning, true);
    assert.equal(state.cam.manualX, 0);
    assert.equal(state.cam.manualY, 0);
    assert.ok(state.impactHold <= 0);
  }
});
