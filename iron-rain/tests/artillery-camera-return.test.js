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
  const state = makeState();
  const hold = state.impactHold;
  stepCamera(state, -1, 1200);
  assert.equal(state.impactHold, hold);
  assert.equal(state.cam.mode, 'impact');
  stepCamera(state, Number.NaN, 1200);
  assert.equal(state.impactHold, hold);
  assert.equal(state.cam.mode, 'impact');

  beginReturn(state);
  const before = { x: state.cam.x, y: state.cam.y, elapsed: state.cam.elapsed };
  stepCamera(state, Number.POSITIVE_INFINITY, 1200);
  assert.deepEqual({ x: state.cam.x, y: state.cam.y, elapsed: state.cam.elapsed }, before);
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
