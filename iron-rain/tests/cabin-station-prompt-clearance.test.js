import assert from 'node:assert/strict';
import test from 'node:test';
import { canReachCabinPoint, canSeeCabinPoint, createCabinMovement } from '../modules/cabin-controls.js';

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

test('station-facing prompt cannot borrow a reachable aisle point through other machinery', () => {
  const movement = createCabinMovement();
  const from = { x: -1.55, z: 2.05 };
  const aisleFocus = { x: -1.55, z: 1.88 };
  const extinguisher = { x: -2.25, z: 1.88 };

  assert.equal(canReachCabinPoint(from.x, from.z, aisleFocus.x, aisleFocus.z, .08), true, 'the aisle interaction point remains reachable');
  assert.equal(canSeeCabinPoint(from.x, from.z, extinguisher.x, extinguisher.z), false, 'the radio cabinet blocks direct sight to the extinguisher');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, extinguisher) }), true);
  assert.notEqual(movement.focus()?.id, 'extinguisher', 'looking through the cabinet must not activate the hidden extinguisher');
});

test('station sight accepts the target machine surface but rejects intervening machinery', () => {
  assert.equal(canSeeCabinPoint(-.85, -2.25, -1.57, -2.68), true, 'the driver console itself may terminate the sight ray');
  assert.equal(canSeeCabinPoint(-1.55, 2.05, -2.25, 1.88), false, 'a different cabinet blocks the ray before the target');
});

test('station prompt clears when the player looks far above the console', () => {
  const movement = createCabinMovement();
  const from = { x: -.95, z: -.15 };
  const focus = { x: -.9, z: .7 };
  const console = { x: -1.6, y: 1.03, z: .7 };

  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, focus), pitch: .91 }), true);
  assert.notEqual(movement.focus()?.id, 'map', 'horizontal overlap alone must not keep the map prompt active while looking at the ceiling');

  assert.equal(movement.lookToward(console, 1), true);
  assert.equal(movement.focus()?.id, 'map', 'looking back at the physical console restores the prompt');
});

test('narrow interaction ray still cannot cross cabin machinery', () => {
  const movement = createCabinMovement();
  const from = { x: -1.2, z: -.3 };
  const target = { x: -.9, z: .7 };
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, target) }), true);
  assert.notEqual(movement.focus()?.id, 'map');
});

test('radio keeps the prompt at its own focus when extinguisher is collinear', () => {
  const movement = createCabinMovement();
  const from = { x: -1.55, z: 2.53 };
  const extinguisher = { x: -1.55, z: 1.88 };
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, extinguisher) }), true);
  assert.equal(movement.focus()?.id, 'radio');
});

test('extinguisher keeps the prompt at its own focus when radio is collinear', () => {
  const movement = createCabinMovement();
  const from = { x: -1.55, z: 1.88 };
  const radio = { x: -1.55, z: 2.53 };
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, radio) }), true);
  assert.equal(movement.focus()?.id, 'extinguisher');
});