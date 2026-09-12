import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReserveDecision } from '../modules/combat-reserves.js';

const readyLogistics = Object.freeze({
  connected: true,
  hasOutpost: false,
  hasDepot: true,
  hasGarage: false,
  canReceiveReinforcements: true,
  reinforcementSupport: .12,
});

test('reserve decision admits and sizes one batch from the same logistics snapshot', () => {
  assert.deepEqual(combatReserveDecision({
    logistics: readyLogistics,
    timerExpired: true,
    fallbackComplete: true,
    deficit: 20,
  }), {
    ready: true,
    reason: 'ready',
    amount: 2.4,
    timerExpired: true,
    fallbackComplete: true,
    logisticsReady: true,
  });
});

test('reserve decision never materializes a batch when admission is blocked', () => {
  for (const [logistics, timerExpired, fallbackComplete, reason] of [
    [readyLogistics, false, true, 'timer'],
    [readyLogistics, true, false, 'fallback'],
    [{ ...readyLogistics, connected: false, canReceiveReinforcements: false }, true, true, 'route'],
  ]) {
    const result = combatReserveDecision({ logistics, timerExpired, fallbackComplete, deficit: 20 });
    assert.equal(result.ready, false);
    assert.equal(result.amount, 0);
    assert.equal(result.reason, reason);
  }
});

test('reserve decision treats a full-strength formation as no reserve due', () => {
  const result = combatReserveDecision({
    logistics: readyLogistics,
    timerExpired: true,
    fallbackComplete: true,
    deficit: 0,
  });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'deficit');
  assert.equal(result.amount, 0);
  assert.equal(result.logisticsReady, true);
});
