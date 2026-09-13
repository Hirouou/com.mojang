import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

const node = (id, stock = {}) => createLogisticsNode({ id, team: 'ally', stock });
const road = (id, from, to, distance) => createSupplyRoute({ id, team: 'ally', from, to, distance });

test('convoy reroutes from a physical junction when its planned road closes', () => {
  const destination = node('D');
  const logistics = createStrategicLogistics({
    nodes: [node('A', { materials: 10 }), node('B'), node('C'), destination],
    routes: [
      road('A-B', 'A', 'B', 100),
      road('B-D', 'B', 'D', 100),
      road('B-C', 'B', 'C', 120),
      road('C-D', 'C', 'D', 120),
    ],
  });

  const dispatch = logistics.dispatch({ team: 'ally', from: 'A', to: 'D', cargo: { materials: 6 }, speed: 100 });
  assert.equal(dispatch.ok, true);
  assert.equal(logistics.setRouteOpen('B-D', false), true);

  const junctionEvents = logistics.step(1);
  assert.deepEqual(junctionEvents.map(event => event.type), ['convoy-rerouted']);
  assert.equal(junctionEvents[0].previousRouteId, 'B-D');
  assert.equal(junctionEvents[0].routeId, 'B-C');
  assert.equal(junctionEvents[0].fromNode, 'B');

  const rerouted = logistics.snapshot().convoys.find(convoy => convoy.id === dispatch.convoyId);
  assert.deepEqual(rerouted.path.map(leg => leg.routeId), ['A-B', 'B-C', 'C-D']);
  assert.equal(rerouted.leg, 1);
  assert.equal(rerouted.legProgress, 0);

  const arrivalEvents = logistics.step(2.4);
  assert.equal(arrivalEvents.at(-1)?.type, 'convoy-arrived');
  assert.equal(destination.stock.materials, 6);
});

test('convoy already inside a closed road stays blocked instead of teleporting to an alternate route', () => {
  const logistics = createStrategicLogistics({
    nodes: [node('A', { ammo: 4 }), node('C'), node('D')],
    routes: [
      road('A-D', 'A', 'D', 200),
      road('A-C', 'A', 'C', 150),
      road('C-D', 'C', 'D', 150),
    ],
  });

  const dispatch = logistics.dispatch({ team: 'ally', from: 'A', to: 'D', cargo: { ammo: 4 }, speed: 100 });
  assert.equal(dispatch.ok, true);
  assert.deepEqual(logistics.step(.5), []);
  assert.equal(logistics.setRouteOpen('A-D', false), true);

  const blockedEvents = logistics.step(.1);
  assert.deepEqual(blockedEvents.map(event => event.type), ['convoy-blocked']);

  const blocked = logistics.snapshot().convoys.find(convoy => convoy.id === dispatch.convoyId);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.legProgress, 50);
  assert.deepEqual(blocked.path.map(leg => leg.routeId), ['A-D']);
});

test('convoy routing trades modest distance for a materially safer open road', () => {
  const logistics = createStrategicLogistics({
    nodes: [node('A', { fuel: 5 }), node('B'), node('D')],
    routes: [
      road('A-D', 'A', 'D', 150),
      road('A-B', 'A', 'B', 100),
      road('B-D', 'B', 'D', 100),
    ],
  });

  assert.equal(logistics.setRouteOpen('A-D', true, .9), true);
  assert.deepEqual(logistics.route('ally', 'A', 'D').map(leg => leg.routeId), ['A-B', 'B-D']);

  const dispatch = logistics.dispatch({ team: 'ally', from: 'A', to: 'D', cargo: { fuel: 5 } });
  assert.equal(dispatch.ok, true);
  const convoy = logistics.snapshot().convoys.find(item => item.id === dispatch.convoyId);
  assert.deepEqual(convoy.path.map(leg => leg.routeId), ['A-B', 'B-D']);

  assert.equal(logistics.setRouteOpen('A-D', true, 0), true);
  assert.deepEqual(logistics.route('ally', 'A', 'D').map(leg => leg.routeId), ['A-D']);
});
