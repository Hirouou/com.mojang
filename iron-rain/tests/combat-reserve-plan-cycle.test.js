import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlanCycle } from '../modules/combat-reserves.js';

function logisticsGraph({ cut = false } = {}) {
  const nodes = new Map([
    ['rear', { id: 'rear', team: 'ally', alive: true, kind: 'depot', assets: { troops: 20 } }],
    ['front', { id: 'front', team: 'ally', alive: true, kind: 'depot', assets: { troops: 10 } }],
  ]);
  const routes = [{ id: 'rear-front', from: 'rear', to: 'front', knownThreat: 0 }];
  return {
    getNode(id) { return nodes.get(id) || null; },
    snapshot() { return { nodes: [...nodes.values()], routes }; },
    route(team, from, to) {
      if (cut || team !== 'ally' || from !== 'rear' || to !== 'front') return null;
      return [{ routeId: 'rear-front', from: 'rear', to: 'front', distance: 100 }];
    },
  };
}

const depotTerritory = Object.freeze({
  id: 'front',
  owner: 'ally',
  contested: false,
  structures: Object.freeze(['depot']),
});

test('canonical reserve cycle keeps a due request pending while the strategic route is cut', () => {
  const result = combatReservePlanCycle({
    strategicLogistics: logisticsGraph({ cut: true }),
    territory: depotTerritory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 1,
    fallbackUntil: 0,
    tick: 20,
    strength: 80,
  });

  assert.equal(result.routeOpen, false);
  assert.equal(result.logistics.connected, false);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'route');
  assert.equal(result.amount, 0);
  assert.equal(result.nextTimer, 0);
});

test('canonical reserve cycle admits, debits and resets from the same territory snapshot', () => {
  const strategicLogistics = logisticsGraph();
  const result = combatReservePlanCycle({
    strategicLogistics,
    territory: depotTerritory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 1,
    fallbackUntil: 12,
    tick: 12,
    strength: 80,
    resetIn: 55,
  });

  assert.equal(result.routeOpen, true);
  assert.equal(result.logistics.reinforcementSupport, .12);
  assert.equal(result.logistics.availableTroops, 10);
  assert.equal(result.logistics.deployableTroops, 8);
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'ready');
  assert.equal(result.amount, 2);
  assert.equal(result.remainingTroops, 8);
  assert.equal(strategicLogistics.getNode('front').assets.troops, 8);
  assert.equal(result.nextTimer, 55);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.logistics), true);
});

test('canonical reserve cycle fails closed for contested territory without consuming the due timer', () => {
  const result = combatReservePlanCycle({
    strategicLogistics: logisticsGraph(),
    territory: { ...depotTerritory, contested: true },
    team: 'ally',
    from: 'rear',
    to: 'front',
    timer: 0,
    fallbackUntil: 0,
    tick: 20,
    strength: 80,
  });

  assert.equal(result.routeOpen, true);
  assert.equal(result.logistics.connected, false);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'route');
  assert.equal(result.nextTimer, 0);
});