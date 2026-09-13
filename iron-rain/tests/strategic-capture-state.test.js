import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerritoryNode } from '../modules/territory-development.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';
import { applyAuthoritativeSectorControl } from '../modules/strategic-capture-state.js';

function fixture() {
  const record = { sector: { id: 'HX-01-S3', owner: 'enemy', controlProgress: 1 } };
  const territoryNode = createTerritoryNode({ id: record.sector.id, owner: 'enemy' });
  territoryNode.contested = false;
  territoryNode.securedFor = 240;
  territoryNode.activeProject = 'bunker';
  territoryNode.projectProgress = 12;
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: record.sector.id, team: 'enemy', kind: 'front' }),
      createLogisticsNode({ id: 'rear-enemy', team: 'enemy', kind: 'depot' }),
      createLogisticsNode({ id: 'rear-ally', team: 'ally', kind: 'depot' }),
    ],
    routes: [
      createSupplyRoute({ id: 'enemy-link', team: 'enemy', from: 'rear-enemy', to: record.sector.id }),
      createSupplyRoute({ id: 'ally-link', team: 'ally', from: 'rear-ally', to: record.sector.id }),
      createSupplyRoute({ id: 'unrelated', team: 'enemy', from: 'rear-enemy', to: 'elsewhere' }),
    ],
  });
  return { record, territoryNode, logistics };
}

test('authoritative capture reconciles sector, territory and logistics and cuts stale incident routes', () => {
  const state = fixture();
  const result = applyAuthoritativeSectorControl({ ...state, owner: 'ally' });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'captured:ally');
  assert.equal(state.record.sector.owner, 'ally');
  assert.equal(state.record.sector.controlProgress, 1);
  assert.equal(state.territoryNode.owner, 'ally');
  assert.equal(state.territoryNode.contested, false);
  assert.equal(state.territoryNode.securedFor, 0);
  assert.equal(state.territoryNode.activeProject, null);
  assert.equal(state.territoryNode.projectProgress, 0);
  assert.equal(state.logistics.getNode('HX-01-S3').team, 'ally');
  assert.deepEqual(new Set(result.cutRoutes), new Set(['enemy-link', 'ally-link']));

  const routes = Object.fromEntries(state.logistics.snapshot().routes.map(route => [route.id, route]));
  assert.equal(routes['enemy-link'].open, false);
  assert.equal(routes['ally-link'].open, false);
  assert.equal(routes.unrelated.open, true);
  assert.equal(result.territory.lastEvent, 'captured:ally');
  assert.equal(result.logistics.team, 'ally');
});

test('replaying the same authoritative owner is idempotent and does not cut healthy routes', () => {
  const state = fixture();
  state.record.sector.owner = 'enemy';
  const result = applyAuthoritativeSectorControl({ ...state, owner: 'enemy' });

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.cutRoutes, []);
  assert.equal(state.logistics.snapshot().routes.find(route => route.id === 'enemy-link').open, true);
});

test('projection mismatch fails closed without mutating any strategic layer', () => {
  const state = fixture();
  state.territoryNode.id = 'wrong-sector';
  const before = state.logistics.snapshot();
  const result = applyAuthoritativeSectorControl({ ...state, owner: 'ally' });

  assert.deepEqual(result, { ok: false, changed: false, reason: 'projection-mismatch' });
  assert.equal(state.record.sector.owner, 'enemy');
  assert.equal(state.logistics.getNode('HX-01-S3').team, 'enemy');
  assert.deepEqual(state.logistics.snapshot(), before);
});
