import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

const node = (id, stock = {}) => createLogisticsNode({ id, team: 'ally', stock });
const road = (id, from, to, distance) => createSupplyRoute({ id, team: 'ally', from, to, distance });

function createNetwork() {
  return createStrategicLogistics({
    nodes: [node('A', { fuel: 20 }), node('B'), node('D')],
    routes: [
      road('A-D', 'A', 'D', 150),
      road('A-B', 'A', 'B', 100),
      road('B-D', 'B', 'D', 100),
    ],
  });
}

test('convoy replans around a newly reported threatened road while still at the junction', () => {
  const logistics = createNetwork();
  const dispatch = logistics.dispatch({ team: 'ally', from: 'A', to: 'D', cargo: { fuel: 5 }, speed: 10 });
  assert.equal(dispatch.ok, true);
  assert.deepEqual(logistics.snapshot().convoys[0].path.map(leg => leg.routeId), ['A-D']);

  assert.equal(logistics.setRouteOpen('A-D', true, .9), true);
  assert.equal(logistics.reportRouteThreat('A-D', { team: 'ally', threat: .9, reportedAt: 0 }), true);
  const events = logistics.step(1);
  const convoy = logistics.snapshot().convoys[0];

  assert.deepEqual(convoy.path.map(leg => leg.routeId), ['A-B', 'B-D']);
  assert.equal(convoy.leg, 0);
  assert.equal(convoy.legProgress, 10);
  assert.deepEqual(events.filter(event => event.type === 'convoy-rerouted').map(event => [event.previousRouteId, event.routeId]), [['A-D', 'A-B']]);
});

test('convoy does not teleport off a reported threatened road after entering its segment', () => {
  const logistics = createNetwork();
  const dispatch = logistics.dispatch({ team: 'ally', from: 'A', to: 'D', cargo: { fuel: 5 }, speed: 10 });
  assert.equal(dispatch.ok, true);

  logistics.step(2);
  let convoy = logistics.snapshot().convoys[0];
  assert.equal(convoy.legProgress, 20);

  assert.equal(logistics.setRouteOpen('A-D', true, .9), true);
  assert.equal(logistics.reportRouteThreat('A-D', { team: 'ally', threat: .9, reportedAt: 2 }), true);
  const events = logistics.step(1);
  convoy = logistics.snapshot().convoys[0];

  assert.deepEqual(convoy.path.map(leg => leg.routeId), ['A-D']);
  assert.equal(convoy.legProgress, 30);
  assert.equal(events.some(event => event.type === 'convoy-rerouted'), false);
});
