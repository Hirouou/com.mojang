import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotIntelObservation } from '../modules/intel-report-ledger.js';
import { applyRouteThreatIntel } from '../modules/route-threat-intel.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

function makeLogistics() {
  const logistics = createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id: 'A', team: 'ally' }),
      createLogisticsNode({ id: 'B', team: 'ally' }),
      createLogisticsNode({ id: 'C', team: 'ally' }),
    ],
    routes: [
      createSupplyRoute({ id: 'direct', team: 'ally', from: 'A', to: 'B', distance: 100 }),
      createSupplyRoute({ id: 'detour-a', team: 'ally', from: 'A', to: 'C', distance: 60 }),
      createSupplyRoute({ id: 'detour-b', team: 'ally', from: 'C', to: 'B', distance: 60 }),
    ],
  });
  logistics.setRouteOpen('direct', true, 1);
  return logistics;
}

test('earned route-threat intel is snapshotted without retaining live observation state', () => {
  const live = { id: 'obs-1', type: 'ESTRADA', x: 10, y: 20, routeId: 'direct', routeThreat: 1, source: 'RECON' };
  const report = snapshotIntelObservation(live, 40);

  assert.equal(report.routeId, 'direct');
  assert.equal(report.routeThreat, 1);
  assert.equal(Object.isFrozen(report), true);

  live.routeId = 'detour-a';
  live.routeThreat = 0;
  assert.equal(report.routeId, 'direct');
  assert.equal(report.routeThreat, 1);
});

test('fresh earned intel can divert logistics without consulting live route threat', () => {
  const logistics = makeLogistics();
  assert.deepEqual(logistics.route('ally', 'A', 'B').map(leg => leg.id), ['direct']);

  const report = snapshotIntelObservation({
    id: 'route-observation', type: 'ESTRADA', x: 10, y: 20,
    routeId: 'direct', routeThreat: 1, source: 'OBSERVADOR'
  }, 100);

  assert.equal(applyRouteThreatIntel(logistics, [report], { team: 'ally', now: 110 }), 1);
  assert.deepEqual(logistics.route('ally', 'A', 'B').map(leg => leg.id), ['detour-a', 'detour-b']);
});

test('stale or wrong-faction reports fail closed and do not divert a convoy', () => {
  const staleLogistics = makeLogistics();
  const report = snapshotIntelObservation({
    id: 'old-route-observation', type: 'ESTRADA', x: 10, y: 20,
    routeId: 'direct', routeThreat: 1, source: 'RÁDIO'
  }, 10);

  assert.equal(applyRouteThreatIntel(staleLogistics, [report], { team: 'ally', now: 400 }), 0);
  assert.deepEqual(staleLogistics.route('ally', 'A', 'B').map(leg => leg.id), ['direct']);

  const enemyLogistics = makeLogistics();
  assert.equal(applyRouteThreatIntel(enemyLogistics, [report], { team: 'enemy', now: 20 }), 0);
  assert.deepEqual(enemyLogistics.route('ally', 'A', 'B').map(leg => leg.id), ['direct']);
});
