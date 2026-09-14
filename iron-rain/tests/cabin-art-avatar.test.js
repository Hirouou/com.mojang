import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createCabinCrewAvatars } from '../modules/crew-avatar-visual.js';
import { createCabinCrewVisualLayer } from '../modules/crew-visual-layer.js';

test('only the explicit driver station seats the remote body; releasing restores the unchanged walking pose', () => {
  const scene = new THREE.Scene(), avatars = createCabinCrewAvatars(scene, { capacity: 1 });
  const pose = Object.freeze({ x: -.7, z: -2.4, yaw: .3, pitch: -.1 });
  const standing = avatars.update([{ id: 'driver', pose }], .1)[0];
  assert.equal(standing.seated, false);
  assert.equal(standing.x, pose.x); assert.equal(standing.z, pose.z);
  const root = scene.children[0], count = root.children.length;
  const seated = avatars.update([{ id: 'driver', station: 'drive', pose }], .1)[0];
  assert.equal(seated.seated, true); assert.equal(seated.stride, 0);
  assert.equal(seated.x, -1.76); assert.equal(seated.z, -1.91);
  assert.equal(root.position.y, -.31);
  assert.equal(root.children.length, count, 'posing allocates no scene objects');
  const standingAgain = avatars.update([{ id: 'driver', station: null, pose }], .1)[0];
  assert.equal(standingAgain.seated, false); assert.equal(root.position.y, 0);
  assert.equal(standingAgain.x, pose.x); assert.equal(standingAgain.z, pose.z);
  assert.deepEqual(pose, { x: -.7, z: -2.4, yaw: .3, pitch: -.1 });
  avatars.dispose();
});

test('validated crew presentation preserves an explicit occupied station and clears seated ghosts', () => {
  const scene = new THREE.Scene(), visuals = createCabinCrewVisualLayer(scene, { capacity: 1 });
  const pose = { x: -.7, z: -2.4, yaw: 0, pitch: 0 };
  const seated = visuals.update([{ id: 'crew', station: 'drive', pose }], 1, .1)[0];
  assert.equal(seated.seated, true);
  assert.equal(visuals.presenceSnapshot()[0].station, 'drive');
  visuals.update([], 1, .1);
  assert.equal(visuals.snapshot()[0].visible, false);
  assert.equal(visuals.snapshot()[0].seated, false);
  const invalidStation = visuals.update([{ id: 'crew', station: 'invented-driver', pose }], 1, .1)[0];
  assert.equal(invalidStation.seated, false);
  visuals.dispose();
});
