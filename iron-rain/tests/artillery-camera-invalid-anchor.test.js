import test from 'node:test';
import assert from 'node:assert/strict';
import { beginReturn, cameraAnchor, stepCamera } from '../modules/camera-director.js';

const makeState = () => ({
  robot: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
  cam: { x: 5000, y: 4200, zoom: 1.5, mode: 'impact', manualX: 0, manualY: 0, elapsed: 0 },
  returning: false,
  impactHold: 0,
});

test('invalid Mamute coordinates do not push the artillery return camera across the theatre', () => {
  const state = makeState();
  assert.deepEqual(cameraAnchor(state, 1200), { x: 5000, y: 4200 });

  beginReturn(state);
  for (let i = 0; i < 12; i += 1) stepCamera(state, 0.1, 1200);

  assert.equal(state.cam.x, 5000);
  assert.equal(state.cam.y, 4200);
  assert.equal(Number.isFinite(state.cam.x), true);
  assert.equal(Number.isFinite(state.cam.y), true);
});

test('a partial Mamute coordinate never creates a hybrid return anchor', () => {
  const invalidX = makeState();
  invalidX.robot = { x: Number.NaN, y: 9100 };
  assert.deepEqual(cameraAnchor(invalidX, 1200), { x: 5000, y: 4200 });

  const invalidY = makeState();
  invalidY.robot = { x: 8800, y: Number.NaN };
  assert.deepEqual(cameraAnchor(invalidY, 1200), { x: 5000, y: 4200 });
});
