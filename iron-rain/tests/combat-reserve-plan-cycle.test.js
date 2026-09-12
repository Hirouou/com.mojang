import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlanCycle } from '../modules/combat-reserves.js';

function logisticsGraph({ cut = false } = {}) {
  const nodes = new Map([
    ['rear', { id: 'rear', team: 'ally', alive: true }],
    ['front', { id: 'front', team: 'ally', alive: true }],
  ]);
  return {
    getNode(id) { return nodes.get(id) || null; },
    route(team, from, to) {
      if (cut || team !== 'ally' || from !== 'rear' || to !== 'front') return null;
      return ['rear', 'front'];
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

test('canonical reserve cycle admits and resets from the same territory snapshot', () => {
  const result = combatReservePlanCycle({
    strategicLogistics: logisticsGraph(),
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
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'ready');
  assert.equal(result.amount, 2.4);
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
