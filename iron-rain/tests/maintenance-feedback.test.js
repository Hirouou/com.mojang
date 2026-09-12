import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceFeedback } from '../modules/maintenance-feedback.js';

test('extinguishing exposes ring progress and visible spray strength', () => {
  const feedback = maintenanceFeedback({ health: 42, fire: .8, action: { type: 'extinguish', elapsed: 1.5, duration: 3 } });
  assert.equal(feedback.kind, 'extinguish');
  assert.equal(feedback.active, true);
  assert.equal(feedback.progress, .5);
  assert.equal(feedback.ring, .5);
  assert.ok(feedback.spray > .8);
  assert.match(feedback.label, /50%/);
});

test('repair exposes progress and mechanical motion without extinguisher spray', () => {
  const feedback = maintenanceFeedback({ health: 60, fire: 0, action: { type: 'repair', elapsed: 3, duration: 6 } });
  assert.equal(feedback.kind, 'repair');
  assert.equal(feedback.progress, .5);
  assert.equal(feedback.spray, 0);
  assert.ok(feedback.repairMotion > 0);
  assert.ok(feedback.sparks >= 0);
});

test('idle damaged and burning states remain readable', () => {
  assert.equal(maintenanceFeedback({ health: 50, fire: 0 }).kind, 'damaged');
  assert.equal(maintenanceFeedback({ health: 50, fire: .4 }).kind, 'fire');
  assert.equal(maintenanceFeedback({ health: 100, fire: 0 }).kind, 'ready');
});

test('malformed action timings clamp safely', () => {
  const feedback = maintenanceFeedback({ health: 10, fire: 1, action: { type: 'extinguish', elapsed: Infinity, duration: 0 } });
  assert.ok(Number.isFinite(feedback.progress));
  assert.ok(feedback.progress >= 0 && feedback.progress <= 1);
});
