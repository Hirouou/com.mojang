import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlanCycle } from '../modules/combat-reserves.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function graph() {
  return createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'ALLY-REAR', team: 'ally', kind: 'depot' }),
      createLogisticsNode({ id: 'ALLY-FRONT', team: 'ally', kind: 'front', assets: { troops: 4 } }),
    ],
    routes: [createSupplyRoute({ id: 'REAR-FRONT', team: 'ally', from: 'ALLY-REAR', to: 'ALLY-FRONT', distance: 900 })],
  });
}

const territory = { owner: 'ally', contested: false, structures: ['outpost', 'depot'] };

test('live reserve context delegates physical debit to the world asset reconciler', () => {
  const strategicLogistics = graph();
  let claims = 0;
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory,
    team: 'ally',
    to: 'ALLY-FRONT',
    claimAsset: () => { claims += 1; return true; },
    timer: 0,
    fallbackUntil: 0,
    tick: 1,
    strength: 80,
    resetIn: 47,
  });

  assert.equal(result.ready, true);
  assert.equal(result.amount, 3);
  assert.equal(result.debitDelegated, true);
  assert.equal(strategicLogistics.getNode('ALLY-FRONT').assets.troops, 4, 'plan cycle must not pre-debit a live context');
  assert.equal(claims, 0, 'claimAsset remains owned by the world reconciliation step');
});

test('standalone reserve cycle still debits the exact staging inventory itself', () => {
  const strategicLogistics = graph();
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory,
    team: 'ally',
    to: 'ALLY-FRONT',
    timer: 0,
    fallbackUntil: 0,
    tick: 1,
    strength: 80,
    resetIn: 47,
  });

  assert.equal(result.ready, true);
  assert.equal(result.amount, 3);
  assert.equal(result.remainingTroops, 1);
  assert.equal(strategicLogistics.getNode('ALLY-FRONT').assets.troops, 1);
});
