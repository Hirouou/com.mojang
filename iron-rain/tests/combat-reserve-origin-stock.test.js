import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReserveOrigin } from '../modules/combat-reserves.js';
import { createLogisticsNode, createStrategicLogistics, createSupplyRoute } from '../modules/strategic-logistics.js';

test('reserve origin skips nearer canonical depots with no troops', () => {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'empty-near', team: 'ally', kind: 'depot', assets: { troops: 0 } }),
      createLogisticsNode({ id: 'stocked-far', team: 'ally', kind: 'depot', assets: { troops: 4 } }),
      createLogisticsNode({ id: 'front', team: 'ally', kind: 'outpost' }),
    ],
    routes: [
      createSupplyRoute({ id: 'near-front', team: 'ally', from: 'empty-near', to: 'front', distance: 100 }),
      createSupplyRoute({ id: 'far-front', team: 'ally', from: 'stocked-far', to: 'front', distance: 400 }),
    ],
  });

  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'front' }), 'stocked-far');
});

test('reserve origin fails closed when every canonical depot is empty', () => {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'rear-a', team: 'enemy', kind: 'depot', assets: { troops: 0 } }),
      createLogisticsNode({ id: 'rear-b', team: 'enemy', kind: 'depot', assets: { troops: 0 } }),
      createLogisticsNode({ id: 'front', team: 'enemy', kind: 'outpost' }),
    ],
    routes: [
      createSupplyRoute({ id: 'a-front', team: 'enemy', from: 'rear-a', to: 'front', distance: 100 }),
      createSupplyRoute({ id: 'b-front', team: 'enemy', from: 'rear-b', to: 'front', distance: 200 }),
    ],
  });

  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'enemy', to: 'front' }), null);
});
