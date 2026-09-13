import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlanCycle } from '../modules/combat-reserves.js';

function logisticsGraph(troops = 4) {
  const nodes = new Map([
    ['rear', { id: 'rear', team: 'ally', alive: true, kind: 'depot', assets: { troops: 12 } }],
    ['front', { id: 'front', team: 'ally', alive: true, kind: 'outpost', assets: { troops } }],
  ]);
  return {
    getNode(id) { return nodes.get(id) || null; },
    snapshot() { return { nodes: [...nodes.values()] }; },
    route(team, from, to) {
      if (team !== 'ally' || from !== 'rear' || to !== 'front') return null;
      return [{ routeId: 'rear-front', from: 'rear', to: 'front', distance: 100 }];
    },
  };
}

const territory = Object.freeze({
  id: 'front',
  owner: 'ally',
  contested: false,
  structures: Object.freeze(['outpost', 'depot']),
});

test('reserve cycle leaves a physical staging garrison behind', () => {
  const strategicLogistics = logisticsGraph(4);
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 0,
    fallbackUntil: 0,
    tick: 10,
    strength: 40,
    resetIn: 50,
  });

  assert.equal(result.logistics.garrisonReserve, 1);
  assert.equal(result.logistics.availableTroops, 4);
  assert.equal(result.logistics.deployableTroops, 3);
  assert.equal(result.ready, true);
  assert.equal(result.amount, 3);
  assert.equal(result.remainingTroops, 1);
  assert.equal(strategicLogistics.getNode('front').assets.troops, 1);
});

test('last staging defender is not consumed as a reinforcement', () => {
  const strategicLogistics = logisticsGraph(1);
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 0,
    fallbackUntil: 0,
    tick: 10,
    strength: 40,
  });

  assert.equal(result.logistics.availableTroops, 1);
  assert.equal(result.logistics.deployableTroops, 0);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'troops');
  assert.equal(result.amount, 0);
  assert.equal(result.nextTimer, 0);
  assert.equal(strategicLogistics.getNode('front').assets.troops, 1);
});
