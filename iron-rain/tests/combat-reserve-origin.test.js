import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReserveOrigin, combatReservePlanCycle } from '../modules/combat-reserves.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function graph() {
  return createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'ALLY-REAR-A', team: 'ally', kind: 'depot' }),
      createLogisticsNode({ id: 'ALLY-REAR-B', team: 'ally', kind: 'depot' }),
      createLogisticsNode({ id: 'ALLY-MID', team: 'ally', kind: 'outpost' }),
      createLogisticsNode({ id: 'ALLY-FRONT', team: 'ally', kind: 'front', assets: { troops: 4 } }),
      createLogisticsNode({ id: 'ENEMY-REAR', team: 'enemy', kind: 'depot' }),
    ],
    routes: [
      createSupplyRoute({ id: 'A-MID', team: 'ally', from: 'ALLY-REAR-A', to: 'ALLY-MID', distance: 900 }),
      createSupplyRoute({ id: 'MID-FRONT', team: 'ally', from: 'ALLY-MID', to: 'ALLY-FRONT', distance: 700 }),
      createSupplyRoute({ id: 'B-FRONT', team: 'ally', from: 'ALLY-REAR-B', to: 'ALLY-FRONT', distance: 1100 }),
    ],
  });
}

test('reserve origin is the nearest reachable friendly depot through canonical routes', () => {
  const logistics = graph();
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'ALLY-FRONT' }), 'ALLY-REAR-B');

  logistics.setRouteOpen('B-FRONT', false);
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'ALLY-FRONT' }), 'ALLY-REAR-A');

  logistics.setRouteOpen('MID-FRONT', false);
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'ALLY-FRONT' }), null);
});

test('reserve origin never borrows an enemy depot or a non-depot field node', () => {
  const logistics = graph();
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'enemy', to: 'ALLY-FRONT' }), null);
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'missing' }), null);
});

test('plan cycle can derive its origin without a second routing system', () => {
  const logistics = graph();
  const territory = { owner: 'ally', contested: false, structures: ['outpost', 'depot'] };
  const result = combatReservePlanCycle({
    strategicLogistics: logistics,
    territory,
    team: 'ally',
    to: 'ALLY-FRONT',
    timer: 0,
    fallbackUntil: 4,
    tick: 4,
    strength: 80,
    resetIn: 47,
  });

  assert.equal(result.origin, 'ALLY-REAR-B');
  assert.equal(result.routeOpen, true);
  assert.equal(result.ready, true);
  assert.ok(Math.abs(result.amount - 3.4) < 1e-9);
  assert.equal(result.nextTimer, 47);
});
