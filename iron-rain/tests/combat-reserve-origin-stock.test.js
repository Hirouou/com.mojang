import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReserveOrigin, combatReservePlan } from '../modules/combat-reserves.js';
import { createLogisticsNode, createStrategicLogistics, createSupplyRoute } from '../modules/strategic-logistics.js';

test('reserve origin skips nearer canonical depots with no troops when a stocked route exists', () => {
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

test('empty depots keep route lineage but cannot admit undelivered troops', () => {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'rear-a', team: 'enemy', kind: 'depot', assets: { troops: 0 } }),
      createLogisticsNode({ id: 'rear-b', team: 'enemy', kind: 'depot', assets: { troops: 0 } }),
      createLogisticsNode({ id: 'front', team: 'enemy', kind: 'outpost', assets: { troops: 0 } }),
    ],
    routes: [
      createSupplyRoute({ id: 'a-front', team: 'enemy', from: 'rear-a', to: 'front', distance: 100 }),
      createSupplyRoute({ id: 'b-front', team: 'enemy', from: 'rear-b', to: 'front', distance: 200 }),
    ],
  });

  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'enemy', to: 'front' }), 'rear-a');
  const plan = combatReservePlan({
    strategicLogistics: logistics,
    territory: { owner: 'enemy', contested: false, structures: ['outpost'] },
    team: 'enemy',
    to: 'front',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 40,
  });
  assert.equal(plan.origin, 'rear-a');
  assert.equal(plan.routeOpen, true);
  assert.equal(plan.ready, false);
  assert.equal(plan.reason, 'troops');
});

test('reserve origin accepts a stocked depot already used as the staging destination', () => {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'staging', team: 'ally', kind: 'depot', assets: { troops: 3 } }),
    ],
    routes: [],
  });

  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'staging' }), 'staging');
});

test('reserve origin does not treat an empty local depot as a stocked zero-hop source', () => {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'staging', team: 'enemy', kind: 'depot', assets: { troops: 0 } }),
    ],
    routes: [],
  });

  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'enemy', to: 'staging' }), null);
});
