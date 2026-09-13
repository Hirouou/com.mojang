import test from 'node:test';
import assert from 'node:assert/strict';
import { combatSustainmentSupply } from '../modules/combat-sustainment.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function theatre() {
  return createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'rear', team: 'ally', kind: 'depot', stock: { ammo: 220 } }),
      createLogisticsNode({ id: 'field', team: 'ally', kind: 'outpost', stock: { ammo: 80 } }),
    ],
    routes: [createSupplyRoute({ id: 'road-1', team: 'ally', from: 'rear', to: 'field', distance: 9_000 })],
  });
}

const territory = Object.freeze({ owner: 'ally', contested: false, structures: ['outpost'] });
const supply = logistics => combatSustainmentSupply({ strategicLogistics: logistics, territory, team: 'ally', from: 'rear', to: 'field' });

test('combat sustainment reacts only to earned route threat while intel is usable', () => {
  const logistics = theatre();
  const baseline = supply(logistics);

  assert.equal(logistics.reportRouteThreat('road-1', { team: 'ally', threat: .8, reportedAt: 0 }), true);
  const snapshot = logistics.snapshot();
  assert.equal(snapshot.routes[0].knownThreat, .8, 'canonical snapshot should expose the already-aged threat value used by routing');

  const threatened = supply(logistics);
  assert.ok(threatened < baseline, `known route danger should reduce tactical sustainment (${threatened} < ${baseline})`);
  assert.ok(threatened < .3, 'severe known route danger should stop a stocked line from reading as assault-ready supply');

  logistics.step(301);
  assert.equal(logistics.snapshot().routes[0].knownThreat, 0, 'stale route intel must not remain tactical omniscience');
  assert.equal(supply(logistics), baseline, 'once intel is stale, combat AI should stop applying the old route threat');
});

test('enemy route reports cannot suppress allied sustainment', () => {
  const logistics = theatre();
  const baseline = supply(logistics);
  assert.equal(logistics.reportRouteThreat('road-1', { team: 'enemy', threat: 1, reportedAt: 0 }), false);
  assert.equal(supply(logistics), baseline);
});
