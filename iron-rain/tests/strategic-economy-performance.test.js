import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTheatre } from '../modules/strategic-war-live-v3.js';
import { createTerritoryNode } from '../modules/territory-development.js';
import { createLogisticsNode, createSupplyRoute } from '../modules/strategic-logistics.js';

function fixture() {
  const sectors = [{ id: 'depot', x: 10000, y: 10000 }, { id: 'junction', x: 26000, y: 10000 }, { id: 'works', x: 27000, y: 10000 }]
    .map(s => ({ ...s, owner: 'ally', name: s.id, structures: [] }));
  const territory = sectors.map(s => {
    const node = createTerritoryNode({ id: s.id, owner: 'ally' });
    Object.assign(node, { contested: false, securedFor: 700, structures: ['outpost', 'depot'] });
    if (s.id === 'works') node.stock = { materials: 500, ammo: 100, fuel: 100 };
    return [s.id, node];
  });
  const nodes = sectors.map(s => createLogisticsNode({ ...s, team: 'ally', kind: s.id === 'depot' ? 'depot' : 'outpost' }));
  const routes = [['road-a', 'depot', 'junction'], ['road-direct', 'depot', 'works'], ['road-b', 'junction', 'works']]
    .map(([id, from, to]) => createSupplyRoute({ id, from, to, team: 'ally', distance: 100 }));
  return makeTheatre({ version: 1, hexes: [{ id: 'region', q: 0, r: 0, x: 20000, y: 10000, sectors }], territory,
    logistics: { version: 1, nodes, routes, serial: 0, intelNow: 0, convoys: [] }, inFlight: [] });
}

test('cached economy topology is rebuilt when roads close, reopen or change faction', () => {
  const theatre = fixture(), works = theatre.territory.get('works');
  works.activeProject = 'bunker';
  theatre.step(1); assert.equal(works.projectProgress, 1);
  theatre.logistics.setRouteOpen('road-a', false);
  theatre.logistics.setRouteOpen('road-direct', false);
  theatre.step(1); assert.equal(works.projectProgress, 1, 'cut route pauses construction');
  theatre.logistics.setRouteOpen('road-a', true);
  theatre.step(1); assert.equal(works.projectProgress, 2, 'reopened indirect route resumes construction');
  theatre.logistics.getNode('junction').team = 'enemy';
  theatre.step(1); assert.equal(works.projectProgress, 2, 'captured endpoint cannot retain a cached allied route');
});

test('earned route threat changes development, then expires from the next economy topology', () => {
  const theatre = fixture(), works = theatre.territory.get('works');
  theatre.step(1); assert.equal(works.activeProject, 'garage');
  Object.assign(works, { activeProject: null, stock: { materials: 500, ammo: 100, fuel: 100 } });
  theatre.logistics.reportRouteThreat('road-direct', { team: 'ally', threat: .8, reportedAt: 1 });
  theatre.step(1); assert.equal(works.activeProject, 'bunker', 'known danger on shortest supply path prompts defense');
  Object.assign(works, { activeProject: null, stock: { materials: 500, ammo: 100, fuel: 100 } });
  for (let i = 0; i < 6; i++) theatre.logistics.step(60);
  theatre.step(1); assert.equal(works.activeProject, 'garage', 'stale intel does not remain cached indefinitely');
});

test('route cache never caches finite stock or spends one truck on two deliveries', () => {
  const theatre = fixture(), depot = theatre.logistics.getNode('depot');
  depot.stock.materials = 70; depot.assets.trucks = 1;
  for (const id of ['junction', 'works']) {
    Object.assign(theatre.territory.get(id), { structures: [], securedFor: 90, stock: { materials: 0, ammo: 0, fuel: 0 } });
  }
  theatre.step(1);
  const convoys = theatre.logistics.snapshot().convoys;
  assert.equal(convoys.length, 1);
  assert.equal(convoys[0].cargo.materials, 35); assert.equal(convoys[0].assets.trucks, 1);
  assert.equal(depot.stock.materials, 35); assert.equal(depot.assets.trucks, 0);
});

test('checkpoint restore rebuilds routing and preserves delivery/construction state', () => {
  const original = fixture();
  original.territory.get('works').activeProject = 'bunker';
  original.step(1);
  original.logistics.setRouteOpen('road-direct', false);
  const restored = makeTheatre(original.snapshot());
  for (let i = 0; i < 5; i++) { original.step(1); restored.step(1); }
  assert.deepEqual(restored.snapshot(), original.snapshot());
});
