import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('live cabin hull VFX consumes authored impact presentation channels', () => {
  assert.match(source, /hullImpactVisual\.kick\(feedback\)/);
  assert.match(source, /feedback\?\.hullFlash/);
  assert.match(source, /feedback\?\.dustKick/);
  assert.match(source, /feedback\?\.lampFlicker/);
  assert.match(source, /flash\.intensity = flashEnergy \* 17 \+ flicker/);
  assert.match(source, /dustMaterial\.opacity = Math\.min\(\.68, dustEnergy \* \.72\)/);
});

test('impact channel integration stays bounded to existing renderer resources', () => {
  const pointLights = source.match(/new THREE\.PointLight/g) || [];
  assert.equal(pointLights.length, 1);
  assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame/);
  assert.match(source, /energy = flashEnergy = dustEnergy = flickerEnergy = 0/);
});
