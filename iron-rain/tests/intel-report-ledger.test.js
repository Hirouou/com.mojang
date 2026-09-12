import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotIntelObservation, upsertIntelReport, knownTargetIds } from '../modules/intel-report-ledger.js';

test('intel ledger snapshots report data without retaining live entity references', () => {
  const sourcePos = { x: 1200, y: 2300 };
  const liveTarget = { id: 42, type: 'BATERIA', x: 18400, y: 31100, hp: 200, alive: true, source: 'OBS-2', sourcePos };
  const report = snapshotIntelObservation(liveTarget, 75);

  assert.deepEqual(report, {
    id: '42', type: 'BATERIA', x: 18400, y: 31100, reportedAt: 75,
    source: 'OBS-2', sourcePos: { x: 1200, y: 2300 }
  });
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.sourcePos), true);
  assert.equal('alive' in report, false);
  assert.equal('hp' in report, false);

  liveTarget.x = 99999;
  liveTarget.alive = false;
  sourcePos.x = 99999;
  assert.equal(report.x, 18400);
  assert.equal(report.sourcePos.x, 1200);
});

test('intel ledger upserts by stable id and exposes ids without entity objects', () => {
  const first = upsertIntelReport([], { id: 'gun-1', type: 'HMG', x: 10, y: 20 }, 1);
  const second = upsertIntelReport(first, { id: 'gun-2', type: 'MORTEIRO', x: 30, y: 40 }, 2);
  const renewed = upsertIntelReport(second, { id: 'gun-1', type: 'HMG', x: 15, y: 25 }, 3);

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(renewed), true);
  assert.equal(renewed.length, 2);
  assert.deepEqual(renewed.find(item => item.id === 'gun-1'), {
    id: 'gun-1', type: 'HMG', x: 15, y: 25, reportedAt: 3, source: 'Rádio', sourcePos: null
  });
  assert.deepEqual(knownTargetIds(renewed), ['gun-1', 'gun-2']);
});

test('intel ledger fails closed for malformed coordinates or timestamps', () => {
  assert.equal(snapshotIntelObservation({ id: 'bad', x: 'unknown', y: 20 }, 10), null);
  assert.equal(snapshotIntelObservation({ id: 'bad', x: 10, y: 20 }, 'later'), null);
  const original = Object.freeze([{ id: 'safe', x: 1, y: 2, reportedAt: 0 }]);
  const unchanged = upsertIntelReport(original, { id: 'bad', x: NaN, y: 2 }, 4);
  assert.deepEqual(unchanged, original);
  assert.notEqual(unchanged, original);
});
