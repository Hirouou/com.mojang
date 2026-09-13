import assert from 'node:assert/strict';
import test from 'node:test';
import { canReachCabinPoint, createCabinMovement } from '../modules/cabin-controls.js';

function faceTarget(from, target) {
  return Math.atan2(-(target.x - from.x), -(target.z - from.z));
}

test('map prompt survives tight but visible clearance without relaxing body collision', () => {
  const movement = createCabinMovement();
  const from = { x: -.95, z: -.15 };
  const target = { x: -.9, z: .7 };
  assert.equal(canReachCabinPoint(from.x, from.z, target.x, target.z), false, 'full body radius is intentionally too conservative here');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, target) }), true);
  assert.equal(movement.focus()?.id, 'map');
});

test('driver prompt survives edge clearance beside the instrument panel', () => {
  const movement = createCabinMovement();
  const from = { x: -.85, z: -2.25 };
  const target = { x: -.7, z: -2.4 };
  assert.equal(canReachCabinPoint(from.x, from.z, target.x, target.z), false, 'full body sweep rejects this edge approach');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, target) }), true);
  assert.equal(movement.focus()?.id, 'drive');
});

test('narrow interaction ray still cannot cross cabin machinery', () => {
  const movement = createCabinMovement();
  const from = { x: -1.2, z: -.3 };
  const target = { x: -.9, z: .7 };
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, target) }), true);
  assert.notEqual(movement.focus()?.id, 'map');
});
