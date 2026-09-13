import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteHullImpactFeedback } from '../modules/remote-hull-impact-feedback.js';

test('replicated hull impacts preserve canonical local damage scaling', () => {
  const rifle = remoteHullImpactFeedback({ type: 'impact', payload: { damage: 3, kind: 'rifle' } });
  const tank = remoteHullImpactFeedback({ type: 'impact', payload: { damage: 12, kind: 'tank' } });
  assert.ok(tank.intensity > rifle.intensity);
  assert.ok(tank.cameraShake > rifle.cameraShake);
  assert.ok(tank.lowThump > rifle.lowThump);
});

test('critical replicated impact promotes every perceptible hull channel', () => {
  const light = remoteHullImpactFeedback({ type: 'impact', payload: { damage: 1, kind: 'rifle', intensity: .1 } });
  const result = remoteHullImpactFeedback({ type: 'critical', payload: { damage: 1, kind: 'rifle', intensity: .1 } });
  assert.equal(result.intensity, 1);
  assert.equal(result.active, true);
  assert.equal(result.label, 'IMPACTO PESADO NO CASCO');
  assert.ok(result.duration > light.duration);
  assert.ok(result.cameraShake > light.cameraShake);
  assert.ok(result.hullFlash > light.hullFlash);
  assert.ok(result.dustKick > light.dustKick);
  assert.ok(result.lampFlicker > light.lampFlicker);
  assert.ok(result.metalRattle > light.metalRattle);
  assert.ok(result.lowThump > light.lowThump);
  assert.ok(result.sharpCrack > light.sharpCrack);
});

test('valid transmitted intensity is retained while malformed events fail closed', () => {
  assert.equal(remoteHullImpactFeedback({ type: 'impact', payload: { intensity: .42 } }).intensity, .42);
  assert.equal(remoteHullImpactFeedback({ type: 'repair', payload: { intensity: 1 } }), null);
});
