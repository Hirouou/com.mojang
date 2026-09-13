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

test('map prompt can use a reachable near-edge focus when the aisle focus is blocked by the table', () => {
  const movement = createCabinMovement();
  const from = { x: -1.9, z: -.3 };
  const aisleFocus = { x: -.9, z: .7 };
  const nearEdgeFocus = { x: -1.6, z: -.16 };

  assert.equal(canReachCabinPoint(from.x, from.z, aisleFocus.x, aisleFocus.z, .08), false, 'the table itself blocks the remote aisle focus point');
  assert.equal(canReachCabinPoint(from.x, from.z, nearEdgeFocus.x, nearEdgeFocus.z, .08), true, 'the near table edge remains physically reachable');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, nearEdgeFocus) }), true);
  assert.equal(movement.focus()?.id, 'map');
});

test('aim prompt can use a reachable side focus when the front focus is blocked by the crank console', () => {
  const movement = createCabinMovement();
  const from = { x: -1.3, z: -1.2 };
  const frontFocus = { x: -.21, z: -.78 };
  const sideFocus = { x: -.98, z: -1.2 };
  const aimStation = { x: -.21, z: -1.05 };

  assert.equal(canReachCabinPoint(from.x, from.z, frontFocus.x, frontFocus.z, .08), false, 'the crank console blocks the front interaction point from this side');
  assert.equal(canReachCabinPoint(from.x, from.z, sideFocus.x, sideFocus.z, .08), true, 'the left console edge remains physically reachable');
  assert.equal(canSeeCabinPoint(from.x, from.z, aimStation.x, aimStation.z), true, 'the physical aiming controls remain visible from the side');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, aimStation) }), true);
  assert.equal(movement.focus()?.id, 'aim');
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

test('driver prompt cannot use an aisle focus while another machine hides the controls', () => {
  const movement = createCabinMovement();
  const from = { x: -1.5, z: -1.2 };
  const aisleFocus = { x: -.7, z: -2.4 };
  const driverControls = { x: -1.57, z: -2.68 };

  assert.equal(canReachCabinPoint(from.x, from.z, aisleFocus.x, aisleFocus.z, .08), true, 'the remote aisle focus is geometrically reachable');
  assert.equal(canSeeCabinPoint(from.x, from.z, driverControls.x, driverControls.z), false, 'the aiming console blocks sight to the driver controls');
  assert.equal(movement.setPose({ ...from, yaw: faceTarget(from, driverControls) }), true);
  assert.notEqual(movement.focus()?.id, 'drive', 'reachable empty floor must not activate controls hidden behind machinery');
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