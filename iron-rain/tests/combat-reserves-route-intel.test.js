import test from 'node:test';
import assert from 'node:assert/strict';
import { combatRouteOpen, combatReservePlan } from '../modules/combat-reserves.js';

const territory = Object.freeze({ owner: 'ally', contested: false, structures: ['depot'] });

function logisticsWithThreat(knownThreat) {
  const nodes = [
    { id: 'rear', team: 'ally', kind: 'depot', alive: true, assets: { troops: 12 } },
    { id: 'front', team: 'ally', kind: 'depot', alive: true, assets: { troops: 6 } },
  ];
  const route = { id: 'rear-front', from: 'rear', to: 'front', distance: 1200 };
  if (knownThreat !== undefined) route.knownThreat = knownThreat;
  return {
    getNode(id) { return nodes.find(node => node.id === id) || null; },
    route(team, from, to) {
      if (team === 'ally' && from === 'rear' && to === 'front') {
        return [{ routeId: 'rear-front', from: 'rear', to: 'front', distance: 1200 }];
      }
      return [];
    },
    snapshot() { return { nodes, routes: [route] }; },
  };
}

test('regular reserves do not treat a route with unknown threat intel as safe', () => {
  const logistics = logisticsWithThreat(undefined);
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), false);

  const plan = combatReservePlan({
    strategicLogistics: logistics,
    territory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 30,
  });

  assert.equal(plan.routeOpen, false);
  assert.equal(plan.ready, false);
  assert.equal(plan.reason, 'route');
  assert.equal(plan.amount, 0);
});

test('earned low-threat intel still permits the canonical reserve route', () => {
  const logistics = logisticsWithThreat(.2);
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), true);

  const plan = combatReservePlan({
    strategicLogistics: logistics,
    territory,
    team: 'ally',
    from: 'rear',
    to: 'front',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 30,
  });

  assert.equal(plan.routeOpen, true);
  assert.equal(plan.ready, true);
  assert.ok(plan.amount > 0);
});

test('known dangerous routes remain blocked', () => {
  const logistics = logisticsWithThreat(.8);
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), false);
});
