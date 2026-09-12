import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntelMapSnapshot } from '../modules/intel-map-snapshot.js';

test('map snapshot composes exact, uncertain and lost intel without live entities', () => {
  const reports = Object.freeze([
    Object.freeze({ id: 'fresh', type: 'TANQUE', x: 100, y: 200, reportedAt: 950, source: 'OBS-1' }),
    Object.freeze({ id: 'stale', type: 'BATERIA', x: 300, y: 400, reportedAt: 500, source: 'Rádio' }),
    Object.freeze({ id: 'lost', type: 'BASE', x: 500, y: 600, reportedAt: 0, source: 'RECON' })
  ]);

  const snapshot = buildIntelMapSnapshot(reports, 1000);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.length, 3);
  assert.equal(snapshot[0].mode, 'exact');
  assert.equal(snapshot[0].x, 100);
  assert.equal(snapshot[1].mode, 'area');
  assert.equal(snapshot[1].x, 300);
  assert.ok(snapshot[1].uncertainty >= 300);
  assert.equal(snapshot[2].mode, 'lost');
  assert.equal(snapshot[2].x, null);
  assert.equal(snapshot[2].y, null);
  assert.equal(Object.isFrozen(snapshot[0]), true);
});

test('map snapshot is defensive and never mutates ledger entries', () => {
  const report = { id: 7, type: 'MORTEIRO', x: 20, y: 30, reportedAt: 10, source: 'OBS-2', alive: true };
  const snapshot = buildIntelMapSnapshot([report], 20);
  assert.deepEqual(snapshot[0], {
    id: '7', type: 'MORTEIRO', source: 'OBS-2', reportedAt: 10,
    mode: 'exact', state: 'fresh', label: 'CONTATO RECENTE', confidence: 1,
    uncertainty: 0, x: 20, y: 30
  });
  assert.equal(report.alive, true);
  assert.equal('alive' in snapshot[0], false);
  assert.deepEqual(buildIntelMapSnapshot([{ id: 'bad', x: 1, y: 2, reportedAt: 'later' }], 20), []);
  assert.deepEqual(buildIntelMapSnapshot([report], NaN), []);
});
