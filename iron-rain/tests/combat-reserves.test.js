import test from 'node:test';
import assert from 'node:assert/strict';
import { combatLogisticsState, combatReserveBatch, combatReserveGate, combatRouteOpen } from '../modules/combat-reserves.js';
import { createLogisticsNode, createStrategicLogistics, createSupplyRoute } from '../modules/strategic-logistics.js';

const readyLogistics = Object.freeze({
  connected: true,
  hasOutpost: true,
  hasDepot: false,
  hasGarage: false,
  canReceiveReinforcements: true,
  reinforcementSupport: .05,
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
    reinforcementSupport: .05,
  };
  const result = combatReserveGate({ logistics, timerExpired: true, fallbackComplete: true });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'field-node');
});

test('inconsistent or missing logistics fail closed', () => {
  assert.equal(combatReserveGate({ timerExpired: true, fallbackComplete: true }).ready, false);
  assert.equal(combatReserveGate({
    logistics: { connected: true, hasDepot: true, canReceiveReinforcements: false, reinforcementSupport: .12 },
    timerExpired: true,
    fallbackComplete: true,
  }).reason, 'logistics');
});

test('reserve support must be a positive finite value even when readiness flags claim success', () => {
  for (const reinforcementSupport of [0, -0.1, NaN, Infinity]) {
    const result = combatReserveGate({
      logistics: { ...readyLogistics, reinforcementSupport },
      timerExpired: true,
      fallbackComplete: true,
    });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'support');
    assert.equal(result.logisticsReady, false);
  }
});

test('combat logistics state consumes friendly territory and route state without inventing infrastructure', () => {
  const territory = { owner: 'ally', contested: false, structures: ['outpost'] };
  const state = combatLogisticsState({ territory, team: 'ally', routeOpen: true });
  assert.deepEqual(state, {
    connected: true,
    hasOutpost: true,
    hasDepot: false,
    hasGarage: false,
    canReceiveReinforcements: true,
    reinforcementSupport: .05,
  });
  assert.equal(Object.isFrozen(state), true);
});

test('cut, contested or enemy territory fails closed for reserve logistics', () => {
  const territory = { owner: 'ally', contested: false, structures: ['outpost', 'depot', 'garage'] };
  for (const state of [
    combatLogisticsState({ territory, team: 'ally', routeOpen: false }),
    combatLogisticsState({ territory: { ...territory, contested: true }, team: 'ally', routeOpen: true }),
    combatLogisticsState({ territory, team: 'enemy', routeOpen: true }),
  ]) {
    assert.equal(state.canReceiveReinforcements, false);
    assert.equal(combatReserveGate({ logistics: state, timerExpired: true, fallbackComplete: true }).ready, false);
  }
});

test('the same infrastructure rules apply to enemy formations', () => {
  const ally = combatLogisticsState({ territory: { owner: 'ally', contested: false, structures: ['depot'] }, team: 'ally', routeOpen: true });
  const enemy = combatLogisticsState({ territory: { owner: 'enemy', contested: false, structures: ['depot'] }, team: 'enemy', routeOpen: true });
  assert.deepEqual(enemy, ally);
  assert.equal(enemy.reinforcementSupport, .12);
});

test('combat route reachability delegates to the canonical strategic logistics graph', () => {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'rear', team: 'ally' }),
      createLogisticsNode({ id: 'relay', team: 'ally' }),
      createLogisticsNode({ id: 'front', team: 'ally' }),
      createLogisticsNode({ id: 'enemy', team: 'enemy' }),
    ],
    routes: [
      createSupplyRoute({ id: 'rear-relay', team: 'ally', from: 'rear', to: 'relay' }),
      createSupplyRoute({ id: 'relay-front', team: 'ally', from: 'relay', to: 'front' }),
    ],
  });

  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), true);
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'enemy' }), false);
  assert.equal(combatRouteOpen({ logistics, team: 'enemy', from: 'rear', to: 'front' }), false);

  logistics.setRouteOpen('relay-front', false);
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), false);
});

test('combat reserves avoid a route only when canonical intel marks it lethally threatened', () => {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'rear', team: 'ally' }),
      createLogisticsNode({ id: 'front', team: 'ally' }),
    ],
    routes: [createSupplyRoute({ id: 'rear-front', team: 'ally', from: 'rear', to: 'front', distance: 1000 })],
  });

  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), true);
  logistics.reportRouteThreat('rear-front', { team: 'ally', threat: .74, reportedAt: 10 });
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), true);
  logistics.reportRouteThreat('rear-front', { team: 'ally', threat: .8, reportedAt: 11 });
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'rear', to: 'front' }), false);
});

test('combat route reachability fails closed for invalid endpoints or adapters', () => {
  const logistics = createStrategicLogistics({
    nodes: [createLogisticsNode({ id: 'front', team: 'ally' })],
    routes: [],
  });

  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'front', to: 'front' }), true);
  assert.equal(combatRouteOpen({ logistics, team: 'ally', from: 'missing', to: 'front' }), false);
  assert.equal(combatRouteOpen({ logistics: {}, team: 'ally', from: 'front', to: 'front' }), false);
  assert.equal(combatRouteOpen({ logistics, team: 'neutral', from: 'front', to: 'front' }), false);
});

test('reserve batch has no magic minimum and scales with earned territory support', () => {
  assert.equal(combatReserveBatch({ logistics: readyLogistics, deficit: 20 }), 1);
  assert.equal(combatReserveBatch({
    logistics: { ...readyLogistics, hasOutpost: false, hasDepot: true, reinforcementSupport: .12 },
    deficit: 20,
  }), 2.4);
  assert.equal(combatReserveBatch({
    logistics: { ...readyLogistics, hasOutpost: false, hasDepot: true, hasGarage: true, reinforcementSupport: .2 },
    deficit: 1.25,
  }), 1.25);
});

test('reserve batch fails closed for cut or malformed logistics', () => {
  for (const logistics of [
    null,
    { ...readyLogistics, connected: false },
    { ...readyLogistics, canReceiveReinforcements: false },
    { ...readyLogistics, reinforcementSupport: 0 },
    { ...readyLogistics, reinforcementSupport: NaN },
    { ...readyLogistics, reinforcementSupport: Infinity },
  ]) {
    assert.equal(combatReserveBatch({ logistics, deficit: 20 }), 0);
  }
  assert.equal(combatReserveBatch({ logistics: readyLogistics, deficit: NaN }), 0);
  assert.equal(combatReserveBatch({ logistics: readyLogistics, deficit: -1 }), 0);
});
