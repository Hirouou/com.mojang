import test from 'node:test';
import assert from 'node:assert/strict';
import { hullImpactFeedback } from '../modules/cabin-hit-feedback.js';
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

test('replicated intensity can strengthen but never mute canonical hull feedback', () => {
  const canonical = hullImpactFeedback({ damage: 20, kind: 'tank', inside: true });
  const muted = remoteHullImpactFeedback({ type: 'impact', payload: { damage: 20, kind: 'tank', intensity: .05 } });
  const light = hullImpactFeedback({ damage: 1, kind: 'rifle', inside: true });
  const boosted = remoteHullImpactFeedback({ type: 'impact', payload: { damage: 1, kind: 'rifle', intensity: .95 } });
  assert.equal(muted.intensity, canonical.intensity);
  assert.equal(boosted.intensity, .95);
  assert.equal(boosted.label, 'IMPACTO PESADO NO CASCO');
  assert.ok(boosted.duration > light.duration);
  assert.ok(boosted.cameraShake > light.cameraShake);
  assert.ok(boosted.hullFlash > light.hullFlash);
  assert.ok(boosted.dustKick > light.dustKick);
  assert.ok(boosted.lampFlicker > light.lampFlicker);
  assert.ok(boosted.metalRattle > light.metalRattle);
  assert.ok(boosted.lowThump > light.lowThump);
  assert.ok(boosted.sharpCrack > light.sharpCrack);
});

test('malformed events fail closed while transmitted intensity remains bounded', () => {
  assert.equal(remoteHullImpactFeedback({ type: 'impact', payload: { intensity: 4 } }).intensity, 1);
  assert.equal(remoteHullImpactFeedback({ type: 'repair', payload: { intensity: 1 } }), null);
});
