import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReserveGate } from '../modules/combat-reserves.js';

const readyLogistics = Object.freeze({
  connected: true,
  hasOutpost: true,
  hasDepot: false,
  hasGarage: false,
  canReceiveReinforcements: true,
});

test('reserves arrive only after timer, fallback and local logistics are all ready', () => {
  assert.deepEqual(
    combatReserveGate({ logistics: readyLogistics, timerExpired: true, fallbackComplete: true }),
    { ready: true, reason: 'ready', timerExpired: true, fallbackComplete: true, logisticsReady: true }
  );
  assert.equal(combatReserveGate({ logistics: readyLogistics, timerExpired: false, fallbackComplete: true }).reason, 'timer');
  assert.equal(combatReserveGate({ logistics: readyLogistics, timerExpired: true, fallbackComplete: false }).reason, 'fallback');
});

test('a cut route blocks reserves even when the strategic timer has expired', () => {
  const logistics = { ...readyLogistics, connected: false, canReceiveReinforcements: false };
  const result = combatReserveGate({ logistics, timerExpired: true, fallbackComplete: true });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'route');
  assert.equal(result.logisticsReady, false);
});

test('connected territory without a field logistics node cannot materialize reserves', () => {
  const logistics = {
    connected: true,
    hasOutpost: false,
    hasDepot: false,
    hasGarage: false,
    canReceiveReinforcements: false,
  };
  const result = combatReserveGate({ logistics, timerExpired: true, fallbackComplete: true });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'field-node');
});

test('inconsistent or missing logistics fail closed', () => {
  assert.equal(combatReserveGate({ timerExpired: true, fallbackComplete: true }).ready, false);
  assert.equal(combatReserveGate({
    logistics: { connected: true, hasDepot: true, canReceiveReinforcements: false },
    timerExpired: true,
    fallbackComplete: true,
  }).reason, 'logistics');
});
