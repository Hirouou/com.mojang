import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrategicHexMap } from '../modules/strategic-hex-map.js';
import { radioVisibleHexIds, createWorldMapIntel } from '../modules/world-map-intel.js';

test('remote fronts gain map detail through friendly radio coverage', () => {
  const map = createStrategicHexMap().map(hex => ({ ...hex, sectors: hex.sectors.map(sector => ({ ...sector, structures: [...sector.structures] })) }));
  const friendly = map.find(hex => hex.sectors.some(sector => sector.owner === 'ally'));
  const sector = friendly.sectors.find(item => item.owner === 'ally');
  sector.radio = true;
  const visible = radioVisibleHexIds(map, 'ally');
  assert.ok(visible.includes(friendly.id));
  assert.ok(visible.length >= 1);
  // Deliberately keep the observer far away so this assertion tests radio
  // disclosure rather than the higher-priority local-detail path.
  const intel = createWorldMapIntel({ hexes: map, team: 'ally', playerPosition: { x: 999_999, y: 999_999 } });
  assert.equal(intel.find(hex => hex.id === friendly.id).frontDetail, 'radio');
});

test('radio relays neighboring front presence without live hostile sector ownership', () => {
  const map = createStrategicHexMap().map(hex => ({ ...hex, sectors: hex.sectors.map(sector => ({ ...sector, structures: [...sector.structures] })) }));
  const source = map.find(hex => {
    const allySector = hex.sectors.find(sector => sector.owner === 'ally');
    if (!allySector) return false;
    allySector.radio = true;
    return radioVisibleHexIds(map, 'ally').some(id => id !== hex.id);
  });
  assert.ok(source);
  const visible = radioVisibleHexIds(map, 'ally');
  const neighbor = map.find(hex => hex.id !== source.id && visible.includes(hex.id));
  assert.ok(neighbor);

  const hostile = neighbor.sectors[0];
  hostile.owner = 'enemy';
  const farAway = { x: 999_999, y: 999_999 };
  const radioOnly = createWorldMapIntel({ hexes: map, team: 'ally', playerPosition: farAway });
  const radioView = radioOnly.find(hex => hex.id === neighbor.id);
  assert.equal(radioView.frontDetail, 'radio');
  assert.equal(radioView.sectors.find(sector => sector.id === hostile.id).owner, 'unknown');

  const observed = createWorldMapIntel({
    hexes: map,
    team: 'ally',
    playerPosition: farAway,
    reports: [{ hexId: neighbor.id, sectorId: hostile.id, reportedAt: 100 }],
    now: 100,
  });
  assert.equal(observed.find(hex => hex.id === neighbor.id).sectors.find(sector => sector.id === hostile.id).owner, 'reported-hostile-or-contested');
});

test('enemy rear hexes without radio/recon remain unknown instead of live omniscient markers', () => {
  const map = createStrategicHexMap();
  const enemy = map.find(hex => hex.sectors.every(sector => sector.owner === 'enemy'));
  assert.ok(enemy);
  const intel = createWorldMapIntel({ hexes: map, team: 'ally', playerPosition: { x: 0, y: 0 } });
  const view = intel.find(hex => hex.id === enemy.id);
  assert.equal(view.frontDetail, 'none');
  assert.equal(view.control, 'unknown');
});
