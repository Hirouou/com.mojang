import test from 'node:test';
import assert from 'node:assert/strict';
import { hullImpactFeedback, createHullImpactQueue } from '../modules/cabin-hit-feedback.js';

test('heavy anti-armor hits feel stronger inside the hull than rifle hits', () => {
  const rifle = hullImpactFeedback({ damage: 3, kind: 'rifle', inside: true });
  const tank = hullImpactFeedback({ damage: 12, kind: 'tank', inside: true });
  assert.ok(tank.intensity > rifle.intensity);
  assert.ok(tank.cameraShake > rifle.cameraShake);
  assert.ok(tank.metalRattle > rifle.metalRattle);
});

test('outside presentation path does not add cabin feedback', () => {
  const result = hullImpactFeedback({ damage: 20, kind: 'battery', inside: false });
  assert.equal(result.active, false);
  assert.equal(result.cameraShake, 0);
});

test('impact queue expires old hull reactions instead of accumulating forever', () => {
  const queue = createHullImpactQueue({ max: 2, mergeWindow: 0 });
  queue.push({ damage: 6, kind: 'hmg', inside: true }, 0);
  queue.push({ damage: 12, kind: 'tank', inside: true }, .1);
  queue.push({ damage: 16, kind: 'battery', inside: true }, .2);
  assert.equal(queue.snapshot().length, 2);
  for (let i = 0; i < 10; i++) queue.update(.25);
  assert.equal(queue.snapshot().length, 0);
});

test('impact queue coalesces near-simultaneous hull hits into one stronger reaction', () => {
  const queue = createHullImpactQueue({ max: 4, mergeWindow: .08 });
  const first = queue.push({ damage: 3, kind: 'rifle', inside: true }, 1);
  queue.update(.04);
  const merged = queue.push({ damage: 14, kind: 'tank', inside: true }, 1.06);
  const snapshot = queue.snapshot();

  assert.equal(snapshot.length, 1);
  assert.equal(merged.id, first.id);
  assert.equal(snapshot[0].age, 0);
  assert.ok(snapshot[0].intensity > first.intensity);
  assert.equal(snapshot[0].label, 'IMPACTO PESADO NO CASCO');

  queue.push({ damage: 6, kind: 'hmg', inside: true }, 1.2);
  assert.equal(queue.snapshot().length, 2);
});
