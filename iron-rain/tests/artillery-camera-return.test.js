import test from 'node:test';
import assert from 'node:assert/strict';
import { beginReturn, cameraAnchor, finishCamera, stepCamera } from '../modules/camera-director.js';

const makeState = () => ({
  robot: { x: 1200, y: 800 },
  cam: { x: 5000, y: 4200, zoom: 1.5, mode: 'impact', manualX: 120, manualY: -90, elapsed: 0 },
  returning: false,
  impactHold: 0.25,
});

test('impact camera transitions back to the Mamute and clears manual offset', () => {
  const state = makeState();
  stepCamera(state, 0.3, 1200);
  assert.equal(state.cam.mode, 'return');
  assert.equal(state.returning, true);
  assert.equal(state.cam.manualX, 0);
  assert.equal(state.cam.manualY, 0);

  for (let i = 0; i < 40 && state.cam.mode !== 'follow'; i += 1) stepCamera(state, 0.1, 1200);
  assert.equal(state.cam.mode, 'follow');
  assert.equal(state.returning, false);
  assert.equal(state.impactHold, 0);
  assert.deepEqual({ x: state.cam.x, y: state.cam.y }, cameraAnchor(state, 1200));
});

test('invalid or negative frame deltas cannot extend impact hold or corrupt return timing', () => {
  for (const dt of [-1, Number.NaN]) {
    const state = makeState();
    const hold = state.impactHold;
    stepCamera(state, dt, 1200);
    assert.equal(state.impactHold, hold);
    assert.equal(state.cam.mode, 'return');
    assert.equal(state.returning, true);
    assert.equal(state.cam.elapsed, 0);
  }

  const state = makeState();
  beginReturn(state);
  stepCamera(state, Number.POSITIVE_INFINITY, 1200);
  assert.equal(state.cam.mode, 'follow');
  assert.equal(state.returning, false);
  assert.equal(state.cam.elapsed, 0);
  assert.deepEqual({ x: state.cam.x, y: state.cam.y }, cameraAnchor(state, 1200));
});

test('finishCamera always snaps to the current Mamute anchor', () => {
  const state = makeState();
  state.cam.mode = 'return';
  state.returning = true;
  state.robot.x = 2400;
  state.robot.y = 1600;
  finishCamera(state, 900);
  assert.equal(state.cam.mode, 'follow');
  assert.deepEqual({ x: state.cam.x, y: state.cam.y }, cameraAnchor(state, 900));
});

test('invalid zoom or viewport cannot corrupt the Mamute return anchor', () => {
  for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const state = makeState();
    state.cam.zoom = zoom;
    beginReturn(state);
    for (let i = 0; i < 40 && state.cam.mode !== 'follow'; i += 1) stepCamera(state, 0.1, Number.NaN);
    assert.equal(state.cam.mode, 'follow');
    assert.equal(Number.isFinite(state.cam.x), true);
    assert.equal(Number.isFinite(state.cam.y), true);
    assert.deepEqual({ x: state.cam.x, y: state.cam.y }, cameraAnchor(state, Number.NaN));
  }
});

test('invalid Mamute coordinates cannot poison the artillery camera return', () => {
  const state = makeState();
  state.robot.x = Number.NaN;
  state.robot.y = Number.POSITIVE_INFINITY;
  state.cam.mode = 'return';
  state.returning = true;
  const anchor = cameraAnchor(state, 1200);
  assert.equal(Number.isFinite(anchor.x), true);
  assert.equal(Number.isFinite(anchor.y), true);
  assert.equal(anchor.y, 4200);

  for (let i = 0; i < 40 && state.cam.mode !== 'follow'; i += 1) stepCamera(state, 0.1, 1200);
  assert.equal(state.cam.mode, 'follow');
  assert.equal(Number.isFinite(state.cam.x), true);
  assert.equal(Number.isFinite(state.cam.y), true);
});
