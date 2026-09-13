import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertIntelReport } from '../modules/intel-report-ledger.js';

test('delayed intel cannot rewind a newer report for the same target', () => {
  let reports = upsertIntelReport([], {
    id: 'enemy-1', type: 'CONVOY', x: 10, y: 20, source: 'Recon', routeId: 'r-7', routeThreat: 0.8
  }, 200);

  reports = upsertIntelReport(reports, {
    id: 'enemy-1', type: 'CONVOY', x: -70, y: 4, source: 'Rádio', routeId: 'r-7', routeThreat: 0.1
  }, 150);

  assert.equal(reports.length, 1);
  assert.equal(Object.isFrozen(reports), true);
  assert.deepEqual(reports[0], {
    id: 'enemy-1', type: 'CONVOY', x: 10, y: 20, reportedAt: 200,
    source: 'Recon', sourcePos: null, routeId: 'r-7', routeThreat: 0.8
  });
});

test('equal or newer intel can still refresh the current snapshot', () => {
  let reports = upsertIntelReport([], { id: 'enemy-1', x: 10, y: 20, source: 'Recon' }, 200);
  reports = upsertIntelReport(reports, { id: 'enemy-1', x: 15, y: 25, source: 'Observer' }, 200);
  assert.equal(reports[0].x, 15);
  assert.equal(reports[0].source, 'Observer');

  reports = upsertIntelReport(reports, { id: 'enemy-1', x: 30, y: 40, source: 'Rádio' }, 260);
  assert.equal(reports[0].reportedAt, 260);
  assert.equal(reports[0].x, 30);
  assert.equal(reports[0].y, 40);
});
