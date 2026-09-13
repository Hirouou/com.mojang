import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerritoryNode } from '../modules/territory-development.js';
import { createLogisticsNode, createStrategicLogistics } from '../modules/strategic-logistics.js';
import { applyAuthoritativeSectorControl } from '../modules/strategic-capture-state.js';

function fixture({ owner = 'ally', contested = false, progress = 1 } = {}) {
  const id = 'HX-DRIFT-S1';
  const record = { sector: { id, owner: contested ? 'contested' : owner, controlProgress: progress } };
  const territoryNode = createTerritoryNode({ id, owner });
  territoryNode.contested = contested;
  const logistics = createStrategicLogistics({
    nodes: [createLogisticsNode({ id, team: contested ? null : owner, kind: 'front' })],
  });
  return { record, territoryNode, logistics };
}

test('authoritative reconciliation repairs stale active-sector control progress', () => {
  const state = fixture({ owner: 'ally', contested: false, progress: 0 });
  const result = applyAuthoritativeSectorControl({ ...state, owner: 'ally', contested: false });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(state.record.sector.owner, 'ally');
  assert.equal(state.record.sector.controlProgress, 1);
});

test('authoritative reconciliation repairs stale rebuilding-sector control progress', () => {
  const state = fixture({ owner: 'ally', contested: true, progress: 1 });
  const result = applyAuthoritativeSectorControl({ ...state, owner: 'ally', contested: true });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(state.record.sector.owner, 'contested');
  assert.equal(state.record.sector.controlProgress, 0);
  assert.equal(state.logistics.getNode('HX-DRIFT-S1').team, null);
});
