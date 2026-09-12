import test from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceEffectCadence, MAINTENANCE_EFFECT_INTERVAL } from '../modules/maintenance-effect-cadence.js';

test('maintenance feedback is bounded while preserving starts, switches and completion', () => {
  let result = maintenanceEffectCadence(null, { repairActive: true, progress: .1 }, 1);
  assert.equal(result.emit.type, 'repair');
  let state = result.state;

  result = maintenanceEffectCadence(state, { repairActive: true, progress: .2 }, 1 + MAINTENANCE_EFFECT_INTERVAL / 2);
  assert.equal(result.emit, null, 'frame-rate progress does not spam replicated audio');
  assert.equal(result.state, state);

  result = maintenanceEffectCadence(state, { repairActive: true, progress: .3 }, 1 + MAINTENANCE_EFFECT_INTERVAL + .01);
  assert.equal(result.emit.type, 'repair', 'long maintenance still provides periodic crew feedback');
  state = result.state;

  result = maintenanceEffectCadence(state, { extinguisherActive: true, progress: .4 }, state.at + .01);
  assert.equal(result.emit.type, 'extinguisher', 'changing maintenance tool is immediately perceptible');
  state = result.state;

  result = maintenanceEffectCadence(state, { extinguisherActive: true, progress: 1 }, state.at + .01);
  assert.equal(result.emit.type, 'extinguisher', 'completion is not swallowed by the cadence gate');
  state = result.state;

  result = maintenanceEffectCadence(state, { extinguisherActive: true, progress: 1 }, state.at + .01);
  assert.equal(result.emit, null, 'completion is emitted once');
});

test('maintenance cadence clamps presentation progress and ignores unrelated feedback', () => {
  const clamped = maintenanceEffectCadence(null, { action: 'repair', progress: 8 }, 5);
  assert.deepEqual(clamped.emit, { type: 'repair', payload: { progress: 1 } });
  assert.equal(maintenanceEffectCadence(null, { action: 'inspect' }, 5).emit, null);
  assert.equal(maintenanceEffectCadence(null, { repairActive: true }, Number.NaN).emit, null);
});
