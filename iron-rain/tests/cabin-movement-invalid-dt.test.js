import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCabinMovement } from '../modules/cabin-controls.js';

test('cabin locomotion ignores non-finite frame deltas', () => {
  for (const dt of [NaN, Infinity, -Infinity]) {
    const cabin = createCabinMovement();
    const before = cabin.snapshot();
    cabin.update(dt, { x: 1, y: 1 });
    const after = cabin.snapshot();
    assert.deepEqual(after.position, before.position, `invalid dt ${String(dt)} must not move the operator`);
    assert.equal(after.travelled, before.travelled, `invalid dt ${String(dt)} must not add travelled distance`);
  }
});

test('finite cabin frame deltas keep the existing bounded movement step', () => {
  const cabin = createCabinMovement();
  cabin.update(1, { x: 1 });
  assert.ok(cabin.travelled > 0, 'finite positive dt still moves the operator');
  assert.ok(cabin.travelled <= .165 + 1e-12, 'large finite dt remains capped at the existing 100 ms step');
});
