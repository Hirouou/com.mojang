import test from 'node:test';
import assert from 'node:assert/strict';
import { knownSupplyRouteThreat } from '../modules/strategic-war-live-v3.js';
import { chooseTerritoryProject } from '../modules/territory-ai.js';

function logistics(paths, nodes) {
  return {
    getNode(id) { return nodes[id] || null; },
    route(team, from, to) { return paths[`${team}:${from}:${to}`] ?? null; },
  };
}

function territory(owner = 'ally') {
  return {
    id: `${owner}-road-node`,
    owner,
    contested: false,
    securedFor: 700,
    activeProject: null,
    vehicleProduction: null,
    stock: { materials: 500, ammo: 100, fuel: 100 },
    assets: { trucks: 0, tanks: 0, troops: 0 },
    structures: ['outpost', 'depot'],
  };
}

test('live territorial defense consumes only known threat on the selected supply path', () => {
  const nodes = {
    depot: { id: 'depot', team: 'ally' },
    rear: { id: 'rear', team: 'ally' },
  };
  const paths = {
    'ally:depot:front': [{ routeId: 'reported-road', from: 'depot', to: 'front', distance: 100 }],
    'ally:rear:front': [{ routeId: 'long-safe-road', from: 'rear', to: 'front', distance: 220 }],
  };
  const snapshot = {
    routes: [
      { id: 'reported-road', team: 'ally', knownThreat: .8, threat: 1 },
      { id: 'long-safe-road', team: 'ally', knownThreat: 0, threat: 1 },
    ],
  };

  const threat = knownSupplyRouteThreat({
    team: 'ally',
    destination: 'front',
    sources: ['depot', 'rear'],
    logistics: logistics(paths, nodes),
    snapshot,
  });

  assert.equal(threat, .8);
  assert.deepEqual(
    chooseTerritoryProject(territory(), { frontPressure: .2, routeThreat: threat }),
    { type: 'bunker', reason: 'route-defense' },
  );
});

test('raw route danger without earned knownThreat does not leak into live defense', () => {
  const nodes = { depot: { id: 'depot', team: 'ally' } };
  const paths = {
    'ally:depot:front': [{ routeId: 'unreported-road', from: 'depot', to: 'front', distance: 100 }],
  };
  const snapshot = {
    routes: [{ id: 'unreported-road', team: 'ally', knownThreat: 0, threat: 1 }],
  };

  const threat = knownSupplyRouteThreat({
    team: 'ally',
    destination: 'front',
    sources: ['depot'],
    logistics: logistics(paths, nodes),
    snapshot,
  });

  assert.equal(threat, 0);
  assert.deepEqual(
    chooseTerritoryProject(territory(), { frontPressure: .2, routeThreat: threat }),
    { type: 'garage', reason: 'development' },
  );
});

test('a depot does not fortify against a route it does not need to use', () => {
  const nodes = { depot: { id: 'depot', team: 'ally' } };
  const threat = knownSupplyRouteThreat({
    team: 'ally',
    destination: 'depot',
    sources: ['depot'],
    logistics: logistics({}, nodes),
    snapshot: { routes: [{ id: 'elsewhere', team: 'ally', knownThreat: 1 }] },
  });

  assert.equal(threat, 0);
});