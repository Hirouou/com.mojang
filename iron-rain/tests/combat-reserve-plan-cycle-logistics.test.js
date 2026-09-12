import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';
import { combatReservePlanCycle } from '../modules/combat-reserves.js';

const territory = Object.freeze({ owner: 'ally', contested: false, structures: Object.freeze(['outpost']) });

function graph() {
  return createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'rear', team: 'ally' }),
      createLogisticsNode({ id: 'front', team: 'ally' }),
    ],
    routes: [createSupplyRoute({ id: 'rear-front', team: 'ally', from: 'rear', to: 'front' })],
  });
}

test('reserve plan cycle follows the real strategic-logistics route state', () => {
  const logistics = graph();
  const open = combatReservePlanCycle({ strategicLogistics: logistics, territory, team: 'ally', from: 'rear', to: 'front', timer: 1, fallbackUntil: 0, tick: 2, strength: 90 });
  assert.equal(open.routeOpen, true);
  assert.equal(open.ready, true);
  assert.equal(open.amount, 1);

  logistics.setRouteOpen('rear-front', false);
  const cut = combatReservePlanCycle({ strategicLogistics: logistics, territory, team: 'ally', from: 'rear', to: 'front', timer: 1, fallbackUntil: 0, tick: 2, strength: 90 });
  assert.equal(cut.routeOpen, false);
  assert.equal(cut.ready, false);
  assert.equal(cut.reason, 'route');
  assert.equal(cut.nextTimer, 0);
});

test('reserve plan cycle rejects wrong-faction endpoints from the canonical graph', () => {
  const result = combatReservePlanCycle({ strategicLogistics: graph(), territory, team: 'enemy', from: 'rear', to: 'front', timer: 0, fallbackUntil: 0, tick: 2, strength: 50 });
  assert.equal(result.routeOpen, false);
  assert.equal(result.ready, false);
  assert.equal(result.amount, 0);
  assert.equal(result.nextTimer, 0);
});
