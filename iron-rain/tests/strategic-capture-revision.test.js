import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerritoryNode } from '../modules/territory-development.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';
import { applyAuthoritativeSectorControl } from '../modules/strategic-capture-state.js';

function fixture() {
  const record = { sector: { id: 'HX-REV-S1', owner: 'enemy', controlProgress: 1 } };
  const territoryNode = createTerritoryNode({ id: record.sector.id, owner: 'enemy' });
  territoryNode.contested = false;
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: record.sector.id, team: 'enemy', kind: 'front' }),
      createLogisticsNode({ id: 'rear-enemy', team: 'enemy', kind: 'depot' }),
    ],
    routes: [createSupplyRoute({ id: 'enemy-link', team: 'enemy', from: 'rear-enemy', to: record.sector.id })],
  });
  return { record, territoryNode, logistics };
}

test('newer authoritative sector revisions cannot be rolled back by delayed events', () => {
  const state = fixture();
  const captured = applyAuthoritativeSectorControl({ ...state, owner: 'ally', revision: 12 });
  assert.equal(captured.ok, true);
  assert.equal(captured.changed, true);
  assert.equal(captured.revision, 12);
  assert.equal(state.territoryNode.controlRevision, 12);

  const stale = applyAuthoritativeSectorControl({ ...state, owner: 'enemy', revision: 11 });
  assert.deepEqual(stale, { ok: false, changed: false, reason: 'stale-revision', revision: 12 });
  assert.equal(state.record.sector.owner, 'ally');
  assert.equal(state.territoryNode.owner, 'ally');
  assert.equal(state.logistics.getNode('HX-REV-S1').team, 'ally');
});

test('same revision is idempotent only for the same projected control state', () => {
  const state = fixture();
  applyAuthoritativeSectorControl({ ...state, owner: 'ally', revision: 4 });

  const replay = applyAuthoritativeSectorControl({ ...state, owner: 'ally', revision: 4 });
  assert.equal(replay.ok, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.reason, 'already-current');

  const conflict = applyAuthoritativeSectorControl({ ...state, owner: 'enemy', revision: 4 });
  assert.deepEqual(conflict, { ok: false, changed: false, reason: 'revision-conflict', revision: 4 });
  assert.equal(state.record.sector.owner, 'ally');
});

test('once a sector is revisioned, unversioned control updates fail closed', () => {
  const state = fixture();
  applyAuthoritativeSectorControl({ ...state, owner: 'ally', revision: 7 });

  const legacy = applyAuthoritativeSectorControl({ ...state, owner: 'enemy' });
  assert.deepEqual(legacy, { ok: false, changed: false, reason: 'revision-required', revision: 7 });
  assert.equal(state.record.sector.owner, 'ally');
});
