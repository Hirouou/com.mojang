import test from 'node:test';
import assert from 'node:assert/strict';
import { combatLogisticsState } from '../modules/combat-logistics.js';

test('secured connected field node exposes only delivered local combat support', () => {
  const territory = {
    id: 'sector-a', owner: 'ally', contested: false,
    stock: { ammo: 18, materials: 42, fuel: 7 },
    structures: ['outpost', 'depot'],
  };
  const state = combatLogisticsState(territory, { team: 'ally', routeOpen: true });
  assert.equal(state.secured, true);
  assert.equal(state.connected, true);
  assert.equal(state.canResupplyAmmo, true);
  assert.equal(state.canReceiveReinforcements, true);
  assert.deepEqual(state.stock, { ammo: 18, materials: 42, fuel: 7 });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.stock), true);
});

test('cut route or contested territory blocks support without deleting delivered stock', () => {
  const territory = {
    id: 'sector-b', owner: 'enemy', contested: false,
    stock: { ammo: 12, materials: 5, fuel: 2 },
    structures: ['outpost'],
  };
  const cut = combatLogisticsState(territory, { team: 'enemy', routeOpen: false });
  assert.equal(cut.connected, false);
  assert.equal(cut.canResupplyAmmo, false);
  assert.equal(cut.canReceiveReinforcements, false);
  assert.equal(cut.stock.ammo, 12, 'stock remains physical at the node while the route is cut');

  const contested = combatLogisticsState({ ...territory, contested: true }, { team: 'enemy', routeOpen: true });
  assert.equal(contested.secured, false);
  assert.equal(contested.connected, false);
  assert.equal(contested.canReceiveReinforcements, false);
});

test('wrong owner, missing field structure, empty ammo and invalid stock fail closed', () => {
  const territory = {
    id: 'sector-c', owner: 'ally', contested: false,
    stock: { ammo: NaN, materials: -8, fuel: Infinity },
    structures: [],
  };
  const enemy = combatLogisticsState(territory, { team: 'enemy' });
  assert.equal(enemy.secured, false);
  assert.equal(enemy.canReceiveReinforcements, false);

  const ally = combatLogisticsState(territory, { team: 'ally' });
  assert.deepEqual(ally.stock, { ammo: 0, materials: 0, fuel: 0 });
  assert.equal(ally.canResupplyAmmo, false);
  assert.equal(ally.canReceiveReinforcements, false);
});
