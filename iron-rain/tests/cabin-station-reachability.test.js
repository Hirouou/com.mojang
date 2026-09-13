import test from 'node:test';
import assert from 'node:assert/strict';
import { CABIN_STATIONS, canOccupyCabin, canReachCabinPoint, createCabinMovement } from '../modules/cabin-controls.js';

test('direct station reach rejects a path that crosses solid cabin machinery', () => {
  const from = { x: -2.3, z: 1.8 };
  const blockedTarget = { x: -.9, z: .7 };
  assert.equal(canOccupyCabin(from.x, from.z), true);
  assert.equal(canOccupyCabin(blockedTarget.x, blockedTarget.z), true);
  assert.equal(canReachCabinPoint(from.x, from.z, blockedTarget.x, blockedTarget.z), false, 'walkable endpoints must not permit interaction through the map desk');
});

test('station focus keeps a physically clear operator-side approach interactive', () => {
  const movement = createCabinMovement();
  const map = CABIN_STATIONS.find(station => station.id === 'map');
  assert.ok(map);
  assert.equal(movement.setPose({ x: .5, z: .7, yaw: 0, pitch: 0 }), true);
  assert.equal(canReachCabinPoint(.5, .7, map.focusX, map.focusZ), true);
  assert.equal(movement.lookToward({ x: map.focusX, y: 1.58, z: map.focusZ }), true);
  const focused = movement.focus();
  assert.equal(focused?.id, 'map');
  assert.equal(focused?.reachable, true);
});
