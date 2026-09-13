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

test('driver prompt follows the visible controls as well as the aisle focus point', () => {
  const movement = createCabinMovement();
  const from = { x: -.85, z: -2.25 };
  const visibleControls = { x: -1.57, z: -2.68 };
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, visibleControls) }), true);
  assert.equal(movement.focus()?.id, 'drive');
});

test('station helper point cannot extend interaction beyond the physical hardware radius', () => {
  const movement = createCabinMovement();
  const from = { x: .65, z: .7 };
  const mapHelper = { x: -.9, z: .7 };
  assert.equal(canReachCabinPoint(from.x, from.z, mapHelper.x, mapHelper.z, .08), true, 'helper remains visible through the aisle');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, mapHelper) }), true);
  assert.notEqual(movement.focus()?.id, 'map', 'map hardware is still outside its physical interaction radius');
});

test('narrow interaction ray still cannot cross cabin machinery', () => {
  const movement = createCabinMovement();
  const from = { x: -1.2, z: -.3 };
  const target = { x: -.9, z: .7 };
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, target) }), true);
  assert.notEqual(movement.focus()?.id, 'map');
});