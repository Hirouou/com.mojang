import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlan } from '../modules/combat-reserves.js';

function logisticsGraph({ cut = false } = {}) {
  const nodes = new Map([
    ['rear', { id: 'rear', team: 'ally', alive: true, kind: 'depot', assets: { troops: 20 } }],
    ['front', { id: 'front', team: 'ally', alive: true, kind: 'depot', assets: { troops: 10 } }],
    ['enemy', { id: 'enemy', team: 'enemy', alive: true, kind: 'depot', assets: { troops: 10 } }],
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

test('reserve plan composes route, territory effects, admission and physical batch once', () => {
  const result = combatReservePlan({
    strategicLogistics: logisticsGraph(),
    territory: depotTerritory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 20,
  });

  assert.equal(result.routeOpen, true);
  assert.equal(result.logistics.connected, true);
  assert.equal(result.logistics.reinforcementSupport, .12);
  assert.equal(result.logistics.availableTroops, 10);
  assert.equal(result.logistics.deployableTroops, 8);
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'ready');
  // Physical reserve stock is discrete: support 2.4 admits two actual troops,
  // rather than recreating a fractional legacy reinforcement at the front.
  assert.equal(result.amount, 2);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.logistics), true);
});

test('reserve plan fails closed when the canonical route is cut', () => {
  const result = combatReservePlan({
    strategicLogistics: logisticsGraph({ cut: true }),
    territory: depotTerritory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 20,
  });

  assert.equal(result.routeOpen, false);
  assert.equal(result.logistics.connected, false);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'route');
  assert.equal(result.amount, 0);
});

test('reserve plan rejects a hostile endpoint instead of inventing a combat route', () => {
  const result = combatReservePlan({
    strategicLogistics: logisticsGraph(),
    territory: depotTerritory,
    team: 'ally',
    from: 'rear',
    to: 'enemy',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 20,
  });

  assert.equal(result.routeOpen, false);
  assert.equal(result.ready, false);
  assert.equal(result.amount, 0);
});