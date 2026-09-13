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

test('live reserve context debits the exact accepted batch through the world asset reconciler', () => {
  const strategicLogistics = graph();
  const claims = [];
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory,
    team: 'ally',
    to: 'ALLY-FRONT',
    claimAsset: (type, count) => {
      claims.push({ type, count });
      const front = strategicLogistics.getNode('ALLY-FRONT');
      if (type !== 'troops' || front.assets.troops < count) return false;
      front.assets.troops -= count;
      return true;
    },
    timer: 0,
    fallbackUntil: 0,
    tick: 1,
    strength: 80,
    resetIn: 47,
  });

  assert.equal(result.ready, true);
  assert.equal(result.amount, 3);
  assert.equal(result.debitDelegated, true);
  assert.deepEqual(claims, [{ type: 'troops', count: 3 }]);
  assert.equal(strategicLogistics.getNode('ALLY-FRONT').assets.troops, 1, 'accepted live reserve must consume its physical staging stock');
});

test('live reserve context fails closed when the world asset reconciler rejects the debit', () => {
  const strategicLogistics = graph();
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory,
    team: 'ally',
    to: 'ALLY-FRONT',
    claimAsset: () => false,
    timer: 0,
    fallbackUntil: 0,
    tick: 1,
    strength: 80,
    resetIn: 47,
  });

  assert.equal(result.ready, false);
  assert.equal(result.reason, 'troops');
  assert.equal(result.amount, 0);
  assert.equal(result.nextTimer, 0);
  assert.equal(result.debitDelegated, true);
  assert.equal(strategicLogistics.getNode('ALLY-FRONT').assets.troops, 4);
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