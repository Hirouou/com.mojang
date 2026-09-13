import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlan } from '../modules/combat-reserves.js';

const territory = Object.freeze({ owner: 'ally', contested: false, structures: ['depot'] });

function localDepot(assets) {
  const node = { id: 'front', team: 'ally', kind: 'depot', alive: true };
  if (assets !== undefined) node.assets = assets;
  return {
    getNode(id) { return id === 'front' ? node : null; },
    route() { return []; },
    snapshot() { return { nodes: [node], routes: [] }; },
  };
}

test('canonical combat reserves require physical troop stock at the field node', () => {
  const missingInventory = combatReservePlan({
    strategicLogistics: localDepot(undefined),
    territory,
    team: 'ally',
    from: 'front',
    to: 'front',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 20,
  });

  assert.equal(missingInventory.routeOpen, true);
  assert.equal(missingInventory.logistics.availableTroops, 0);
  assert.equal(missingInventory.logistics.deployableTroops, 0);
  assert.equal(missingInventory.ready, false);
  assert.equal(missingInventory.reason, 'troops');
  assert.equal(missingInventory.amount, 0);
});

test('stocked canonical depot still releases only deployable physical troops', () => {
  const stocked = combatReservePlan({
    strategicLogistics: localDepot({ troops: 5 }),
    territory,
    team: 'ally',
    from: 'front',
    to: 'front',
    timerExpired: true,
    fallbackComplete: true,
    deficit: 20,
  });

  assert.equal(stocked.logistics.availableTroops, 5);
  assert.equal(stocked.logistics.deployableTroops, 3);
  assert.equal(stocked.ready, true);
  assert.equal(stocked.amount, 2);
});
