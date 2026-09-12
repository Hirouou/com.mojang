import test from 'node:test';
import assert from 'node:assert/strict';
import { createCabinMovement } from '../modules/cabin-controls.js';

const withinWrappedRange = yaw => yaw >= -Math.PI && yaw <= Math.PI;
const near = (actual, expected, epsilon = 1e-10) => Math.abs(actual - expected) <= epsilon;

test('cabin movement keeps local yaw wrapped during long first-person sessions', () => {
  const movement = createCabinMovement();

  assert.equal(movement.setPose({ x: 0, z: 2.4, yaw: Math.PI * 40 + .25, pitch: -.08 }), true);
  assert.equal(withinWrappedRange(movement.yaw), true);
  assert.equal(near(movement.yaw, .25), true);

  for (let i = 0; i < 4000; i++) movement.look(-.37, 0);
  assert.equal(withinWrappedRange(movement.yaw), true);
  assert.equal(movement.crewPose().yaw, movement.yaw);
  assert.equal(movement.snapshot().yaw, movement.yaw);
});

test('automatic focus preserves wrapped yaw instead of reintroducing accumulated turns', () => {
  const movement = createCabinMovement();
  movement.setPose({ x: 0, z: 2.4, yaw: -Math.PI * 36 - .4, pitch: 0 });

  assert.equal(movement.lookToward({ x: -2.08, y: 1.4, z: 2.53 }, .5), true);
  assert.equal(withinWrappedRange(movement.yaw), true);
  assert.equal(movement.crewPose().yaw, movement.yaw);
});
