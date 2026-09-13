import assert from 'node:assert/strict';
import test from 'node:test';
import { canReachCabinPoint, canSeeCabinPoint, createCabinMovement } from '../modules/cabin-controls.js';

function faceTarget(from, target) {
  return Math.atan2(-(target.x - from.x), -(target.z - from.z));
}

test('engine prompt can use the reachable front edge when the aisle focus is blocked by the machinery corner', () => {
  const movement = createCabinMovement();
  const from = { x: .8, z: 5.4 };
  const aisleFocus = { x: .5, z: 6.6 };
  const frontEdgeFocus = { x: .66, z: 5.55 };
  const engine = { x: .82, z: 6.6 };

  assert.equal(canReachCabinPoint(from.x, from.z, aisleFocus.x, aisleFocus.z, .08), false, 'the engine block corner obstructs the remote aisle focus');
  assert.equal(canReachCabinPoint(from.x, from.z, frontEdgeFocus.x, frontEdgeFocus.z, .08), true, 'the front edge remains physically reachable from the engine-room entrance');
  assert.equal(canSeeCabinPoint(from.x, from.z, engine.x, engine.z), true, 'the engine machinery remains visible from the entrance');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, frontEdgeFocus) }), true);
  assert.equal(movement.focus()?.id, 'engine');
});
