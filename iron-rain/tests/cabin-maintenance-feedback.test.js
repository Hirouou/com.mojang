import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maintenanceFeedback } from '../modules/maintenance-feedback.js';

const cabinSource = readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('cabin publishes canonical maintenance feedback to the presentation event seam', () => {
  assert.match(cabinSource, /import \{ maintenanceFeedback \} from '\.\/maintenance-feedback\.js';/);
  assert.match(cabinSource, /import '\.\/maintenance-overlay\.js';/);
  assert.match(cabinSource, /const detail = maintenanceFeedback\(engine\);/);
  assert.match(cabinSource, /iron-rain:maintenance-feedback/);
  assert.match(cabinSource, /if \(own\(data, 'engine'\)\) publishMaintenance\(data\.engine\);/);

  const detail = maintenanceFeedback({
    health: 72,
    fire: .6,
    action: { type: 'extinguish', elapsed: 1.5, duration: 3 },
  });
  assert.equal(detail.active, true);
  assert.equal(detail.kind, 'extinguish');
  assert.equal(detail.progress, .5);
});

test('cabin reset and dispose clear maintenance presentation state', () => {
  const clears = cabinSource.match(/clearMaintenance\(\);/g) || [];
  assert.ok(clears.length >= 2);
  assert.match(cabinSource, /detail: \{ active: false \}/);
});
