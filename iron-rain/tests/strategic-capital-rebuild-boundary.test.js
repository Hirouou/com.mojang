import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerritoryNode } from '../modules/territory-development.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';
import { applyAuthoritativeSectorControl } from '../modules/strategic-capture-state.js';

function fixture() {
  const id = 'HX-CAP-S1';
  const record = { sector: { id, owner: 'enemy', controlProgress: 1 } };
  const assets = { trucks: 2, tanks: 1, troops: 12 };
  const territoryNode = createTerritoryNode({ id, owner: 'enemy', assets });
  territoryNode.contested = false;
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id, team: 'enemy', kind: 'front', assets }),
      createLogisticsNode({ id: 'ally-rear', team: 'ally', kind: 'depot', stock: { materials: 200 }, assets: { trucks: 1 } }),
    ],
    routes: [createSupplyRoute({ id: 'capital-link', team: 'ally', from: 'ally-rear', to: id })],
  });
  return { record, territoryNode, logistics };
}

test('a claimed capital remains disputed and non-logistical while rebuilding', () => {
  const state = fixture();
  const rebuilding = applyAuthoritativeSectorControl({ ...state, owner: 'ally', contested: true, revision: 20 });

  assert.equal(rebuilding.ok, true);
  assert.equal(rebuilding.reason, 'rebuilding:ally');
  assert.equal(state.record.sector.owner, 'contested');
  assert.equal(state.record.sector.controlProgress, 0);
  assert.equal(state.territoryNode.owner, 'ally');
  assert.equal(state.territoryNode.contested, true);
  assert.equal(state.logistics.getNode('HX-CAP-S1').team, null);
  assert.deepEqual(rebuilding.cutRoutes, ['capital-link']);
  assert.deepEqual(rebuilding.displacedAssets, { trucks: 2, tanks: 1, troops: 12 });
  assert.deepEqual(state.territoryNode.assets, { trucks: 0, tanks: 0, troops: 0 });
  assert.deepEqual(state.logistics.getNode('HX-CAP-S1').assets, { trucks: 0, tanks: 0, troops: 0 });

  const blocked = state.logistics.dispatch({
    team: 'ally',
    from: 'ally-rear',
    to: 'HX-CAP-S1',
    cargo: { materials: 50 },
    assets: { trucks: 1 },
    kind: 'rebuild',
  });
  assert.deepEqual(blocked, { ok: false, reason: 'invalid-endpoint' });
});

test('reactivating a rebuilt capital does not magically reopen its cut supply route', () => {
  const state = fixture();
  applyAuthoritativeSectorControl({ ...state, owner: 'ally', contested: true, revision: 20 });

  const active = applyAuthoritativeSectorControl({ ...state, owner: 'ally', contested: false, revision: 21 });
  assert.equal(active.ok, true);
  assert.equal(active.reason, 'captured:ally');
  assert.equal(state.record.sector.owner, 'ally');
  assert.equal(state.territoryNode.contested, false);
  assert.equal(state.logistics.getNode('HX-CAP-S1').team, 'ally');
  assert.deepEqual(active.displacedAssets, { trucks: 0, tanks: 0, troops: 0 });
  assert.deepEqual(state.logistics.getNode('HX-CAP-S1').assets, { trucks: 0, tanks: 0, troops: 0 });

  const stillCut = state.logistics.dispatch({
    team: 'ally',
    from: 'ally-rear',
    to: 'HX-CAP-S1',
    cargo: { materials: 50 },
    assets: { trucks: 1 },
  });
  assert.deepEqual(stillCut, { ok: false, reason: 'route-cut' });
});
