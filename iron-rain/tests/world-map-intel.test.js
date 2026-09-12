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
  const intel = createWorldMapIntel({ hexes: map, team: 'ally', playerPosition: { x: 0, y: 0 } });
  assert.equal(intel.find(hex => hex.id === friendly.id).frontDetail, 'radio');
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
