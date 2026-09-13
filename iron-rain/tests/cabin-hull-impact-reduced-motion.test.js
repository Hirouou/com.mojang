import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('reduced motion keeps hull-hit feedback without moving debris through space', () => {
  assert.match(source, /createHullImpactVisual\(scene, \{ reducedMotion = false \} = \{\}\)/);
  assert.match(source, /const particleCount = reducedMotion \? 6 : 12;/);
  assert.match(source, /const motionAge = reducedMotion \? 0 : age;/);
  assert.match(source, /const flicker = reducedMotion \? flickerEnergy \* 1\.6 :/);
  assert.match(source, /flash\.intensity = flashEnergy \* 17 \+ flicker;/);
  assert.match(source, /particle\.scale\.setScalar\(reducedMotion \? \.82 :/);
  assert.match(source, /createHullImpactVisual\(scene, \{ reducedMotion \}\)/);
});
