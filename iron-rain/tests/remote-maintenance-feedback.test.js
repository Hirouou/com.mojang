import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteMaintenanceFeedback } from '../modules/remote-maintenance-feedback.js';

test('remote extinguisher rebuilds the canonical visible spray contract', () => {
  const detail = remoteMaintenanceFeedback('extinguish', .4);
  assert.equal(detail.active, true);
  assert.equal(detail.kind, 'extinguish');
  assert.equal(detail.progress, .4);
  assert.equal(detail.remote, true);
  assert.ok(detail.spray > .02, 'remote extinguisher must keep foam visible in the live overlay');
  assert.equal(detail.repairMotion, 0);
});

test('remote repair rebuilds sparks and tool motion from canonical feedback', () => {
  const detail = remoteMaintenanceFeedback('repair', .5);
  assert.equal(detail.active, true);
  assert.equal(detail.kind, 'repair');
  assert.equal(detail.progress, .5);
  assert.equal(detail.remote, true);
  assert.ok(detail.sparks > .02, 'remote repair must keep sparks visible');
  assert.ok(detail.repairMotion > .02, 'remote repair must keep tool motion visible');
});

test('remote maintenance clamps replicated progress and rejects unrelated effects', () => {
  assert.equal(remoteMaintenanceFeedback('repair', 8).progress, 1);
  assert.equal(remoteMaintenanceFeedback('extinguisher', -.5).progress, 0);
  assert.equal(remoteMaintenanceFeedback('fire', .5), null);
});
