import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createCabinCrewVisualLayer } from '../modules/crew-visual-layer.js';

test('crew visual layer keeps the last drawable pose across a blocked interpolation', () => {
  const scene = new THREE.Scene();
  const layer = createCabinCrewVisualLayer(scene, { capacity: 4 });
  assert.equal(layer.capacity, 2);
  assert.equal(scene.children.length, 2, 'avatar pool is preallocated once');

  const first = layer.update([
    { id: 'gunner', pose: { x: -0.6, z: 0.7, yaw: 0.2, pitch: 0.1 } },
  ], 1, 0.016);
  assert.equal(first[0].visible, true);
  assert.equal(first[0].x, -0.6);
  assert.equal(first[0].z, 0.7);

  // Both endpoints are valid, but their midpoint crosses the navigation desk.
  // crew-presence rejects that midpoint and this visual bridge must keep the
  // last valid pose instead of hiding/teleporting the avatar through furniture.
  const blocked = layer.update([
    {
      id: 'gunner',
      from: { x: -0.6, z: 0.7, yaw: 0.2, pitch: 0.1 },
      to: { x: -2.25, z: 1.75, yaw: 0.9, pitch: -0.1 },
    },
  ], 0.5, 0.016);
  assert.equal(blocked[0].visible, true);
  assert.equal(blocked[0].x, -0.6);
  assert.equal(blocked[0].z, 0.7);
  assert.equal(layer.presenceSnapshot()[0].pose.x, -0.6);

  layer.clear('gunner');
  assert.equal(layer.snapshot()[0].visible, false);
  layer.dispose();
  assert.equal(scene.children.length, 0);
});

test('crew visual layer preserves the two-peer cap and hides omitted peers', () => {
  const scene = new THREE.Scene();
  const layer = createCabinCrewVisualLayer(scene);
  layer.update([
    { id: 'driver', pose: { x: -0.8, z: -2.1, yaw: 0, pitch: 0 } },
    { id: 'radio', pose: { x: -1.15, z: 2.35, yaw: -0.4, pitch: 0.15 } },
    { id: 'extra', pose: { x: 0, z: 2.4, yaw: 0, pitch: 0 } },
  ], 1, 0.016);
  assert.deepEqual(layer.snapshot().map(item => item.id), ['driver', 'radio']);

  layer.update([{ id: 'radio', pose: { x: -1.1, z: 2.3, yaw: -0.35, pitch: 0.1 } }], 1, 0.016);
  assert.equal(layer.snapshot()[0].id, 'radio');
  assert.equal(layer.snapshot()[0].visible, true);
  assert.equal(layer.snapshot()[1].visible, false);
  layer.dispose();
});
