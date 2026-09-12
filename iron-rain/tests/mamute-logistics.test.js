import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplyPoint, createMamuteInventory, consumeShell, resupplyMamute, deliverShellCargo } from '../modules/mamute-logistics.js';

test('Mamute cannot fire forever when onboard ammunition runs out', () => {
  const inventory = createMamuteInventory({ capacity: { HE: 2, SMOKE: 0, FRAG: 0 }, shells: { HE: 2, SMOKE: 0, FRAG: 0 } });
  assert.equal(consumeShell(inventory, 'HE'), true);
  assert.equal(consumeShell(inventory, 'HE'), true);
  assert.equal(consumeShell(inventory, 'HE'), false);
});

test('nearby base cannot resupply shells it does not actually have', () => {
  const inventory = createMamuteInventory({ capacity: { HE: 10, SMOKE: 4, FRAG: 4 }, shells: { HE: 0, SMOKE: 0, FRAG: 0 } });
  const base = createSupplyPoint({ id: 'base', team: 'ally', x: 0, y: 0, shells: {} });
  const empty = resupplyMamute(inventory, base, { team: 'ally', position: { x: 20, y: 0 } });
  assert.equal(empty.ok, false);
  deliverShellCargo(base, { HE: 6, SMOKE: 2, FRAG: 1 }, 'ally');
  const supplied = resupplyMamute(inventory, base, { team: 'ally', position: { x: 20, y: 0 } });
  assert.equal(supplied.ok, true);
  assert.equal(inventory.shells.HE, 6);
  assert.equal(base.shells.HE, 0);
});

test('crew must move to a friendly supply point to replenish', () => {
  const inventory = createMamuteInventory({ shells: { HE: 0, SMOKE: 0, FRAG: 0 } });
  const base = createSupplyPoint({ id: 'base', team: 'ally', x: 0, y: 0, shells: { HE: 10 } });
  assert.equal(resupplyMamute(inventory, base, { team: 'ally', position: { x: 500, y: 0 }, serviceRange: 85 }).ok, false);
  assert.equal(resupplyMamute(inventory, base, { team: 'enemy', position: { x: 0, y: 0 } }).ok, false);
});
