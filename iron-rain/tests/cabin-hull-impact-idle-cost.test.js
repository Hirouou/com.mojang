import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('hull impact VFX stops particle work once presentation channels settle', () => {
  assert.match(source, /const particlesActive = energy > \.015 \|\| dustEnergy > \.015/);
  assert.match(source, /const lightActive = flashEnergy > \.015 \|\| flickerEnergy > \.015/);
  assert.match(source, /if \(!particlesActive && !lightActive\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(source, /if \(!particlesActive\) return;\s*particles\.forEach/);
});

test('idle quiescence clears residual presentation state without adding timers', () => {
  assert.match(source, /energy = flashEnergy = dustEnergy = flickerEnergy = 0/);
  assert.match(source, /shardMaterial\.emissiveIntensity = 0/);
  assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame/);
});
