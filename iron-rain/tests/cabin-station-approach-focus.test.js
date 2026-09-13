import test from 'node:test';
import assert from 'node:assert/strict';
import { CABIN_STATIONS, canOccupyCabin, createCabinMovement } from '../modules/cabin-controls.js';

test('every cabin station exposes a walkable operator-side focus point', () => {
  for (const station of CABIN_STATIONS) {
    assert.ok(Number.isFinite(station.focusX), `${station.id} needs focusX`);
    assert.ok(Number.isFinite(station.focusZ), `${station.id} needs focusZ`);
    assert.equal(canOccupyCabin(station.focusX, station.focusZ), true, `${station.id} focus point must stay outside solid machinery`);
  }
});

test('station focus uses the operator-side point while preserving physical station coordinates', () => {
  const movement = createCabinMovement();
  const map = CABIN_STATIONS.find(station => station.id === 'map');
  assert.ok(map);
  assert.equal(movement.setPose({ x: .5, z: .7, yaw: 0, pitch: 0 }), true);
  assert.equal(movement.lookToward({ x: map.focusX, y: 1.58, z: map.focusZ }), true);

  const focused = movement.focus();
  assert.equal(focused?.id, 'map');
  assert.equal(focused?.x, map.x, 'downstream camera/station logic keeps the real mesh coordinate');
  assert.equal(focused?.z, map.z, 'downstream camera/station logic keeps the real mesh coordinate');
  assert.ok(focused.distance < map.radius, 'walkable approach point controls interaction reach');
});
