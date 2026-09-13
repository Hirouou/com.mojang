import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('crew cabin renders replicated hull impacts inside the live scene', () => {
  assert.match(source, /function createHullImpactVisual\(scene\)/);
  assert.match(source, /hullImpactVisual\.kick\(feedback\.intensity\)/);
  assert.match(source, /hullImpactVisual\.update\(elapsed\)/);
  assert.match(source, /new THREE\.PointLight\('#ffc58d'/);
  assert.match(source, /new THREE\.IcosahedronGeometry\(\.045, 0\)/);
  assert.match(source, /hullImpact: hullImpactVisual\.snapshot\(\)/);
});

test('hull impact visual is cleaned up with the cabin lifecycle', () => {
  assert.match(source, /hullImpactVisual\.reset\(\)/);
  assert.match(source, /hullImpactVisual\.dispose\(\)/);
});
