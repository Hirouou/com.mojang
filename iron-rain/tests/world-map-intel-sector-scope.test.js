import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldMapIntel } from '../modules/world-map-intel.js';

const remoteHex = Object.freeze({
  id: 'HX-REMOTE',
  name: 'REMOTE',
  q: 0,
  r: 0,
  x: 40_000,
  y: 20_000,
  radius: 6_200,
  sectors: Object.freeze([
    Object.freeze({ id: 'ALLY', name: 'ALLY', owner: 'ally', radio: false, structures: Object.freeze([]) }),
    Object.freeze({ id: 'ENEMY-A', name: 'ENEMY A', owner: 'enemy', radio: false, structures: Object.freeze([]) }),
    Object.freeze({ id: 'ENEMY-B', name: 'ENEMY B', owner: 'enemy', radio: false, structures: Object.freeze([]) }),
  ]),
});

const view = reports => createWorldMapIntel({
  hexes: [remoteHex],
  team: 'ally',
  playerPosition: { x: 0, y: 0 },
  reports,
  now: 120,
})[0];

test('sector recon does not reveal unobserved sectors or whole-hex control', () => {
  const intel = view([{ hexId: remoteHex.id, sectorId: 'ENEMY-A', reportedAt: 100 }]);
  assert.equal(intel.frontDetail, 'report');
  assert.equal(intel.control, 'unknown');
  assert.equal(intel.lastReportTime, 100);
  assert.equal(intel.sectors.find(sector => sector.id === 'ALLY')?.owner, 'ally');
  assert.equal(intel.sectors.find(sector => sector.id === 'ENEMY-A')?.owner, 'reported-hostile-or-contested');
  assert.equal(intel.sectors.find(sector => sector.id === 'ENEMY-B')?.owner, 'unknown');
});

test('coarse hex recon preserves whole-hex reported disclosure', () => {
  const intel = view([{ hexId: remoteHex.id, reportedAt: 100 }]);
  assert.equal(intel.control, 'reported');
  assert.equal(intel.sectors.find(sector => sector.id === 'ENEMY-A')?.owner, 'reported-hostile-or-contested');
  assert.equal(intel.sectors.find(sector => sector.id === 'ENEMY-B')?.owner, 'reported-hostile-or-contested');
});
