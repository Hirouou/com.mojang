import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentWarClock } from '../modules/persistent-war-clock.js';

test('strategic clock advances from wall time instead of render frames', () => {
  const clock = createPersistentWarClock({ stepSeconds: 1, lastWallMs: 1_000, simulatedSeconds: 20 });
  const update = clock.advance(6_500);
  assert.equal(update.ticks, 5);
  assert.equal(update.simulatedSeconds, 25);
  assert.ok(update.remainderSeconds >= .49 && update.remainderSeconds <= .51);
});

test('catch-up work is bounded after a very long disconnect', () => {
  const clock = createPersistentWarClock({ stepSeconds: 1, lastWallMs: 0, maxCatchUpSeconds: 60 });
  const update = clock.advance(24 * 60 * 60 * 1000);
  assert.equal(update.ticks, 60);
  assert.equal(update.advancedSeconds, 60);
});
