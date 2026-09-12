import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldMapIntel } from '../modules/world-map-intel.js';

const enemyHex = Object.freeze({
  id: 'HX-ENEMY',
  name: 'REAR',
  q: 0,
  r: 0,
  x: 40_000,
  y: 20_000,
  radius: 6_200,
  sectors: Object.freeze([
    Object.freeze({ id: 'S0', name: 'CENTRO', owner: 'enemy', radio: false, structures: Object.freeze([]) })
  ])
});

test('remote report disclosure degrades with the shared intel-age policy', () => {
  const reports = [{ hexId: enemyHex.id, time: 100 }];
  const fresh = createWorldMapIntel({ hexes: [enemyHex], team: 'ally', playerPosition: { x: 0, y: 0 }, reports, now: 150 })[0];
  assert.equal(fresh.frontDetail, 'report');
  assert.equal(fresh.control, 'reported');

  const stale = createWorldMapIntel({ hexes: [enemyHex], team: 'ally', playerPosition: { x: 0, y: 0 }, reports, now: 500 })[0];
  assert.equal(stale.frontDetail, 'report-stale');
  assert.equal(stale.control, 'unknown');
  assert.equal(stale.sectors[0].owner, 'unknown');

  const lost = createWorldMapIntel({ hexes: [enemyHex], team: 'ally', playerPosition: { x: 0, y: 0 }, reports, now: 1_100 })[0];
  assert.equal(lost.frontDetail, 'none');
  assert.equal(lost.control, 'unknown');
  assert.equal(lost.sectors[0].owner, 'unknown');
});

test('reportedAt and legacy time choose the newest report consistently', () => {
  const reports = [
    { hexId: enemyHex.id, time: 100 },
    { hexId: enemyHex.id, reportedAt: 250 }
  ];
  const intel = createWorldMapIntel({ hexes: [enemyHex], team: 'ally', playerPosition: { x: 0, y: 0 }, reports, now: 300 })[0];
  assert.equal(intel.frontDetail, 'report');
  assert.equal(intel.lastReportTime, 250);
});
