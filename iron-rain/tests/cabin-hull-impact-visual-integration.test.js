import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('crew cabin renders replicated hull impacts inside the live scene', () => {
  assert.match(source, /function createHullImpactVisual\(scene, \{ reducedMotion = false \} = \{\}\)/);
  assert.match(source, /hullImpactVisual\.kick\(feedback\)/);
  assert.match(source, /hullImpactVisual\.update\(elapsed\)/);
  assert.match(source, /new THREE\.PointLight\('#ffc58d'/);
  assert.match(source, /new THREE\.IcosahedronGeometry\(\.045, 0\)/);
  assert.match(source, /hullImpact: hullImpactVisual\.snapshot\(\)/);
});

test('hull impact visual is cleaned up with the cabin lifecycle', () => {
  assert.match(source, /hullImpactVisual\.reset\(\)/);
  assert.match(source, /hullImpactVisual\.dispose\(\)/);
});

test('reduced motion suppresses impact shake but keeps static impact brightness', () => {
  assert.match(source, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\?\.matches === true/);
  assert.match(source, /const shake = reducedMotion \? 0 : Math\.max\(remoteRecoil \* 2\.4, remoteImpact \* 4\.2\)/);
  assert.match(source, /canvas\.style\.filter = remoteImpact > \.65 \? `brightness\(/);
});
