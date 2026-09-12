import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestStationGate, releaseStationGate, stationGateMessage, stationGateState } from '../modules/crew-station-gate.js';

function fakeRuntime({ mode = 'host', connected = true, localId = 'local', owner = null, claimResult = null, releaseResult = true } = {}) {
  let currentOwner = owner;
  return {
    status: () => ({ mode, connected, localId }),
    stationOwner: () => currentOwner,
    claimStation: station => {
      const result = claimResult || { ok: true, reason: 'claimed', station, owner: localId };
      if (result.ok) currentOwner = localId;
      return result;
    },
    releaseStation: () => {
      if (releaseResult) currentOwner = null;
      return releaseResult;
    },
  };
}

test('single-player stays immediately usable without a multiplayer runtime', () => {
  const state = stationGateState(null, 'aim');
  assert.equal(state.ok, true);
  assert.equal(state.ready, true);
  assert.equal(state.reason, 'single-player');
  assert.equal(requestStationGate(null, 'aim').ready, true);
  assert.equal(releaseStationGate(null, 'aim'), true);
});

test('available station is claimed before cabin interaction becomes ready', () => {
  const runtime = fakeRuntime();
  const before = stationGateState(runtime, 'drive');
  assert.equal(before.reason, 'available');
  assert.equal(before.ready, false);

  const claimed = requestStationGate(runtime, 'drive');
  assert.equal(claimed.ok, true);
  assert.equal(claimed.ready, true);
  assert.equal(stationGateState(runtime, 'drive').reason, 'owned');
  assert.equal(releaseStationGate(runtime, 'drive'), true);
  assert.equal(stationGateState(runtime, 'drive').reason, 'available');
});

test('guest request remains pending until host authority grants ownership', () => {
  const runtime = fakeRuntime({
    mode: 'guest',
    claimResult: { ok: false, pending: true, reason: 'pending-host', station: 'map', owner: null },
  });
  const result = requestStationGate(runtime, 'map');
  assert.equal(result.ready, false);
  assert.equal(result.pending, true);
  assert.equal(stationGateMessage(result), 'AGUARDANDO CONFIRMAÇÃO DO POSTO');
});

test('occupied, disconnected or faction-mismatched stations fail closed with player-facing reasons', () => {
  const occupied = fakeRuntime({ owner: 'other-player' });
  const occupiedResult = requestStationGate(occupied, 'radio');
  assert.equal(occupiedResult.ok, false);
  assert.equal(occupiedResult.reason, 'occupied');
  assert.equal(occupiedResult.owner, 'other-player');
  assert.equal(stationGateMessage(occupiedResult), 'POSTO OCUPADO POR OUTRO TRIPULANTE');

  const disconnected = fakeRuntime({ mode: 'guest', connected: false });
  const disconnectedResult = requestStationGate(disconnected, 'engine');
  assert.equal(disconnectedResult.reason, 'not-connected');
  assert.equal(stationGateMessage(disconnectedResult), 'TRIPULAÇÃO DESCONECTADA');

  const mismatch = fakeRuntime({ claimResult: { ok: false, reason: 'faction-mismatch', station: 'aim', owner: null } });
  const mismatchResult = requestStationGate(mismatch, 'aim');
  assert.equal(mismatchResult.reason, 'faction-mismatch');
  assert.equal(mismatchResult.ready, false);
  assert.equal(stationGateMessage(mismatchResult), 'ESTE MAMUTE PERTENCE À OUTRA FACÇÃO');

  const invalid = requestStationGate(occupied, 'teleporter');
  assert.equal(invalid.reason, 'invalid-station');
  assert.equal(invalid.ready, false);
});
