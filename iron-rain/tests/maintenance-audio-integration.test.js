import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const audioSource = fs.readFileSync(new URL('../modules/war-audio.js', import.meta.url), 'utf8');

test('live maintenance feedback reuses canonical audio and cadence seams', () => {
  assert.match(audioSource, /maintenanceEffectCadence\(maintenanceState, detail, Number\(context\?\.currentTime\)\)/);
  assert.match(audioSource, /addEventListener\?\.\('iron-rain:maintenance-feedback', onMaintenanceFeedback\)/);
  assert.match(audioSource, /result\.emit\.type === 'extinguisher'/);
  assert.match(audioSource, /result\.emit\.type === 'repair'/);
  assert.match(audioSource, /removeEventListener\?\.\('iron-rain:maintenance-feedback', onMaintenanceFeedback\)/);
  assert.doesNotMatch(audioSource, /setInterval|setTimeout/);
});
