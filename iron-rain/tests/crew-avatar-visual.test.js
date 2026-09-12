import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createCabinCrewAvatars } from '../modules/crew-avatar-visual.js';

test('remote crew avatars preallocate at most two visible low-poly bodies', () => {
  const scene = new THREE.Scene();
  const avatars = createCabinCrewAvatars(scene, { capacity: 9 });
  assert.equal(avatars.capacity, 2);
  assert.equal(scene.children.length, 2);
  assert.ok(scene.children.every(child => child.visible === false));

  const snap = avatars.update([
    { id: 'gunner', pose: { x: -1.4, z: 1.8, yaw: .4, pitch: .2 } },
    { id: 'radio', pose: { x: -2.1, z: 2.5, yaw: -1, pitch: -.1 } },
    { id: 'ignored', pose: { x: 0, z: 0, yaw: 0, pitch: 0 } },
  ], .016);
  assert.deepEqual(snap.map(item => item.id), ['gunner', 'radio']);
  assert.ok(snap.every(item => item.visible));
  assert.equal(snap[0].x, -1.4);
  assert.equal(snap[0].z, 1.8);
  assert.equal(snap[0].yaw, .4);
  assert.equal(snap[0].pitch, .11);
  assert.ok(Object.isFrozen(snap) && snap.every(Object.isFrozen));

  avatars.dispose();
  assert.equal(scene.children.length, 0);
});

test('avatar updates reuse scene objects and hide omitted peers without spawning ghosts', () => {
  const scene = new THREE.Scene();
  const avatars = createCabinCrewAvatars(scene);
  const roots = [...scene.children];
  avatars.update([{ id: 'driver', pose: { x: -.8, z: -2.1, yaw: 0, pitch: 0 } }], .016);
  avatars.update([{ id: 'driver', pose: { x: -.75, z: -2.05, yaw: .1, pitch: .1 } }], .016);
  assert.deepEqual(scene.children, roots, 'no scene objects are allocated per update');
  assert.equal(avatars.snapshot()[0].visible, true);

  const hidden = avatars.update([], .016);
  assert.equal(hidden[0].visible, false);
  assert.equal(hidden[0].id, null);
  assert.equal(hidden[1].visible, false);
  avatars.dispose();
});
