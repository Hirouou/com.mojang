import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTerritoryProject } from '../modules/territory-ai.js';

function territory(structures, owner = 'ally') {
  return {
    id: `${owner}-logistics-node`,
    owner,
    contested: false,
    securedFor: 700,
    activeProject: null,
    vehicleProduction: null,
    stock: { materials: 500, ammo: 100, fuel: 100 },
    assets: { trucks: 0, tanks: 0, troops: 0 },
    structures: [...structures],
  };
}

test('pressured logistics nodes fortify before expanding support infrastructure', () => {
  const node = territory(['outpost', 'depot']);
  const plan = chooseTerritoryProject(node, { frontPressure: .5 });

  assert.equal(plan?.type, 'bunker');
  assert.equal(plan?.reason, 'logistics-defense');
});

test('low pressure preserves normal development order at logistics nodes', () => {
  const node = territory(['outpost', 'depot']);
  const plan = chooseTerritoryProject(node, { frontPressure: .3 });

  assert.equal(plan?.type, 'mortar');
  assert.equal(plan?.reason, 'development');
});

test('front pressure alone does not skip the first physical depot', () => {
  const node = territory(['outpost']);
  const plan = chooseTerritoryProject(node, { frontPressure: .5 });

  assert.equal(plan?.type, 'depot');
  assert.equal(plan?.reason, 'development');
});

test('logistics-defense priority remains symmetric between factions', () => {
  const context = { frontPressure: .5 };
  const ally = chooseTerritoryProject(territory(['outpost', 'depot'], 'ally'), context);
  const enemy = chooseTerritoryProject(territory(['outpost', 'depot'], 'enemy'), context);

  assert.deepEqual(ally, enemy);
});
