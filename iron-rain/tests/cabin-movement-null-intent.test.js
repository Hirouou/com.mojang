import test from 'node:test';
import assert from 'node:assert/strict';
import { createCabinMovement } from '../modules/cabin-controls.js';

test('cabin movement treats a null input intent as neutral', () => {
  const movement = createCabinMovement();
  const before = movement.snapshot();

  assert.doesNotThrow(() => movement.update(1 / 60, null));
  assert.deepEqual(movement.position, before.position);
  assert.equal(movement.travelled, before.travelled);
});

test('cabin movement keeps malformed axes neutral without poisoning locomotion', () => {
  const movement = createCabinMovement();
  const before = movement.snapshot();

  assert.doesNotThrow(() => movement.update(1 / 60, { x: NaN, y: Infinity }));
  assert.deepEqual(movement.position, before.position);
  assert.equal(movement.travelled, before.travelled);

  movement.update(1 / 60, { x: 0, y: 1 });
  assert.ok(movement.travelled > before.travelled, 'a valid intent still moves after malformed input');
});
