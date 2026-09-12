import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReserveCycle } from '../modules/combat-reserves.js';

const readyLogistics = Object.freeze({
  connected: true,
  hasOutpost: true,
  hasDepot: false,
  hasGarage: false,
  canReceiveReinforcements: true,
  reinforcementSupport: .05,
});

test('reserve countdown advances without admitting a batch before it is due', () => {
  const result = combatReserveCycle({ logistics: readyLogistics, timer: 2, fallbackUntil: 0, tick: 10, strength: 80 });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'timer');
  assert.equal(result.nextTimer, 1);
});

test('a due reserve request stays due while its route is blocked', () => {
  const logistics = { ...readyLogistics, connected: false, canReceiveReinforcements: false };
  const result = combatReserveCycle({ logistics, timer: 1, fallbackUntil: 0, tick: 10, strength: 80 });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'route');
  assert.equal(result.amount, 0);
  assert.equal(result.nextTimer, 0);
});

test('a due reserve request stays due until fallback reorganization completes', () => {
  const result = combatReserveCycle({ logistics: readyLogistics, timer: 0, fallbackUntil: 12, tick: 11, strength: 80 });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'fallback');
  assert.equal(result.nextTimer, 0);
});

test('only a positive admitted batch resets the reserve interval', () => {
  const result = combatReserveCycle({ logistics: readyLogistics, timer: 1, fallbackUntil: 5, tick: 5, strength: 99.5, resetIn: 55 });
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'ready');
  assert.equal(result.amount, .5);
  assert.equal(result.nextTimer, 55);
});
