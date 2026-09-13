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

const criticalTerritory = Object.freeze({
  id: 'front',
  owner: 'ally',
  contested: false,
  structures: Object.freeze(['outpost', 'depot']),
});

const outpostTerritory = Object.freeze({
  id: 'front',
  owner: 'ally',
  contested: false,
  structures: Object.freeze(['outpost']),
});

test('reserve cycle retains a larger physical garrison at critical logistics infrastructure', () => {
  const strategicLogistics = logisticsGraph(4);
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory: criticalTerritory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 0,
    fallbackUntil: 0,
    tick: 10,
    strength: 40,
    resetIn: 50,
  });

  assert.equal(result.logistics.availableTroops, 4);
  assert.equal(result.logistics.deployableTroops, 2);
  assert.equal(result.ready, true);
  assert.equal(result.amount, 2);
  assert.equal(result.remainingTroops, 2);
  assert.equal(strategicLogistics.getNode('front').assets.troops, 2);
});

test('basic outpost still retains one physical defender before dispatching reserves', () => {
  const strategicLogistics = logisticsGraph(4);
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory: outpostTerritory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 0,
    fallbackUntil: 0,
    tick: 10,
    strength: 40,
    resetIn: 50,
  });

  assert.equal(result.logistics.availableTroops, 4);
  assert.equal(result.logistics.deployableTroops, 3);
  assert.equal(result.ready, true);
  assert.equal(result.amount, 1);
  assert.equal(result.remainingTroops, 3);
  assert.equal(strategicLogistics.getNode('front').assets.troops, 3);
});

test('critical staging defenders are not consumed as reinforcements', () => {
  const strategicLogistics = logisticsGraph(2);
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory: criticalTerritory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 0,
    fallbackUntil: 0,
    tick: 10,
    strength: 40,
  });

  assert.equal(result.logistics.availableTroops, 2);
  assert.equal(result.logistics.deployableTroops, 0);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'troops');
  assert.equal(result.amount, 0);
  assert.equal(result.nextTimer, 0);
  assert.equal(strategicLogistics.getNode('front').assets.troops, 2);
});
