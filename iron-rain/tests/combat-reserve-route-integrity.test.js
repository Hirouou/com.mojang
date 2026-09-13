import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReserveOrigin, combatRouteOpen } from '../modules/combat-reserves.js';

function logisticsMock({ malformed = false, empty = false, disconnected = false } = {}) {
  const nodes = [
    { id: 'rear-near', team: 'ally', kind: 'depot', alive: true },
    { id: 'rear-safe', team: 'ally', kind: 'depot', alive: true },
    { id: 'junction', team: 'ally', kind: 'road', alive: true },
    { id: 'front', team: 'ally', kind: 'outpost', alive: true },
  ];
  const byId = new Map(nodes.map(node => [node.id, node]));
  return {
    getNode(id) { return byId.get(id) || null; },
    snapshot() { return { nodes }; },
    route(team, from, to) {
      if (team !== 'ally' || to !== 'front') return null;
      if (from === 'rear-near') {
        if (empty) return [];
        if (malformed) return [{ from, to, distance: 0 }];
        if (disconnected) return [
          { from, to: 'junction', distance: 40 },
          { from: 'rear-safe', to, distance: 40 },
        ];
        return [{ from, to, distance: 80 }];
      }
      if (from === 'rear-safe') return [{ from, to, distance: 140 }];
      return null;
    },
  };
}

test('reserve route gate rejects an empty route between distinct logistics nodes', () => {
  const logistics = logisticsMock({ empty: true });
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear-near', to: 'front' }), false);
});

test('reserve route gate rejects malformed zero-distance legs', () => {
  const logistics = logisticsMock({ malformed: true });
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear-near', to: 'front' }), false);
});

test('reserve route gate rejects non-contiguous canonical legs', () => {
  const logistics = logisticsMock({ disconnected: true });
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear-near', to: 'front' }), false);
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'front' }), 'rear-safe');
});

test('reserve origin skips malformed zero-distance legs instead of treating them as the nearest depot', () => {
  const logistics = logisticsMock({ malformed: true });
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'front' }), 'rear-safe');
});

test('valid canonical route remains eligible', () => {
  const logistics = logisticsMock();
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear-near', to: 'front' }), true);
  assert.equal(combatReserveOrigin({ strategicLogistics: logistics, team: 'ally', to: 'front' }), 'rear-near');
});

test('local staging on the same canonical node remains a valid zero-hop route', () => {
  const logistics = logisticsMock();
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'front', to: 'front' }), true);
});