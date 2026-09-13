import assert from 'node:assert/strict';
import test from 'node:test';
import { createCabinMovement } from '../modules/cabin-controls.js';

test('shallow diagonal input slides along machinery instead of freezing against it', () => {
  const movement = createCabinMovement();
  const start = { x: -2.2, z: -1.3 };

  assert.equal(movement.setPose({ ...start, yaw: Math.PI / 16 }), true);
  movement.update(.1, { x: 1, y: .3 });

  assert.ok(movement.position.z > start.z, 'the free shallow axis should keep sliding along the obstacle');
  assert.ok(movement.travelled > 0, 'collision fallback must preserve valid movement instead of freezing the player');
});
