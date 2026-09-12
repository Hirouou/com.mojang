import test from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceEffectCadence, MAINTENANCE_EFFECT_INTERVAL } from '../modules/maintenance-effect-cadence.js';

test('canonical maintenance feedback is bounded while preserving starts and switches', () => {
  let result = maintenanceEffectCadence(null, { active: true, kind: 'repair', progress: .1 }, 1);
  assert.equal(result.emit.type, 'repair');
  let state = result.state;

  result = maintenanceEffectCadence(state, { active: true, kind: 'repair', progress: .2 }, 1 + MAINTENANCE_EFFECT_INTERVAL / 2);
  assert.equal(result.emit, null, 'frame-rate progress does not spam replicated audio');
  assert.equal(result.state, state);

  result = maintenanceEffectCadence(state, { active: true, kind: 'repair', progress: .3 }, 1 + MAINTENANCE_EFFECT_INTERVAL + .01);
  assert.equal(result.emit.type, 'repair', 'long maintenance still provides periodic crew feedback');
  state = result.state;

  result = maintenanceEffectCadence(state, { active: true, kind: 'extinguish', progress: .4 }, state.at + .01);
  assert.equal(result.emit.type, 'extinguisher', 'changing maintenance tool is immediately perceptible');
});

test('inactive canonical feedback resets cadence so an interrupted action can restart immediately', () => {
  const started = maintenanceEffectCadence(null, { active: true, kind: 'repair', progress: .2 }, 3);
  const stopped = maintenanceEffectCadence(started.state, { active: false, kind: 'damaged', progress: 0 }, 3.05);
  assert.equal(stopped.emit, null);
  assert.equal(stopped.state, null);

  const restarted = maintenanceEffectCadence(stopped.state, { active: true, kind: 'repair', progress: 0 }, 3.06);
  assert.equal(restarted.emit.type, 'repair', 'restart is not swallowed by the previous cadence window');
});

test('maintenance cadence keeps compatibility aliases and clamps presentation progress', () => {
  const clamped = maintenanceEffectCadence(null, { action: 'repair', progress: 8 }, 5);
  assert.deepEqual(clamped.emit, { type: 'repair', payload: { progress: 1 } });

  const legacyExtinguisher = maintenanceEffectCadence(null, { extinguisherActive: true, progress: .5 }, 6);
  assert.equal(legacyExtinguisher.emit.type, 'extinguisher');
  assert.equal(maintenanceEffectCadence(null, { action: 'inspect' }, 5).emit, null);
  assert.equal(maintenanceEffectCadence(null, { active: true, kind: 'repair' }, Number.NaN).emit, null);
});