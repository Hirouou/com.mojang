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
  assert.ok(Math.abs(snap[0].pitch - .11) < 1e-9);
  assert.equal(snap[0].stride, 0, 'fresh peer starts from a neutral gait');
  assert.ok(Object.isFrozen(snap) && snap.every(Object.isFrozen));

  avatars.dispose();
  assert.equal(scene.children.length, 0);
});

test('avatar updates reuse scene objects, preserve peer slots across reorder and hide ghosts', () => {
  const scene = new THREE.Scene();
  const avatars = createCabinCrewAvatars(scene, { palettes: [] });
  const roots = [...scene.children];
  avatars.update([
    { id: 'driver', pose: { x: -.8, z: -2.1, yaw: 0, pitch: 0 } },
    { id: 'radio', pose: { x: -2.1, z: 2.5, yaw: 1, pitch: 0 } },
  ], .016);
  const first = avatars.snapshot();
  const driverSlot = first.findIndex(item => item.id === 'driver');
  const radioSlot = first.findIndex(item => item.id === 'radio');

  avatars.update([
    { id: 'radio', pose: { x: -2.05, z: 2.45, yaw: 1.1, pitch: .1 } },
    { id: 'driver', pose: { x: -.75, z: -2.05, yaw: .1, pitch: .1 } },
  ], .016);
  const reordered = avatars.snapshot();
  assert.deepEqual(scene.children, roots, 'no scene objects are allocated per update');
  assert.equal(reordered[driverSlot].id, 'driver');
  assert.equal(reordered[radioSlot].id, 'radio');

  const hidden = avatars.update([], .016);
  assert.equal(hidden[0].visible, false);
  assert.equal(hidden[0].id, null);
  assert.equal(hidden[0].stride, 0);
  assert.equal(hidden[1].visible, false);
  avatars.dispose();
});

test('remote gait eases across uneven packet cadence instead of snapping limbs neutral', () => {
  const scene = new THREE.Scene();
  const avatars = createCabinCrewAvatars(scene, { capacity: 1 });
  avatars.update([{ id: 'gunner', pose: { x: 0, z: 2.4, yaw: 0, pitch: 0 } }], .016);

  const walking = avatars.update([{ id: 'gunner', pose: { x: .08, z: 2.4, yaw: 0, pitch: 0 } }], .016)[0];
  assert.ok(walking.stride > 0 && walking.stride < .45, 'gait ramps toward movement instead of jumping to full swing');

  const delayedStationary = avatars.update([{ id: 'gunner', pose: { x: .08, z: 2.4, yaw: 0, pitch: 0 } }], .05)[0];
  assert.ok(delayedStationary.stride > 0, 'one stationary packet keeps a short visual settle instead of snapping neutral');
  assert.ok(delayedStationary.stride < walking.stride, 'gait amplitude decays when movement stops');

  let settled = delayedStationary;
  for (let i = 0; i < 20; i++) settled = avatars.update([{ id: 'gunner', pose: { x: .08, z: 2.4, yaw: 0, pitch: 0 } }], .05)[0];
  assert.ok(settled.stride < .001, 'stationary crew settles back to neutral');

  const replacement = avatars.update([{ id: 'radio', pose: { x: .08, z: 2.4, yaw: 0, pitch: 0 } }], .016)[0];
  assert.equal(replacement.stride, 0, 'a slot reassigned to a different peer never inherits the previous gait');
  avatars.dispose();
});
