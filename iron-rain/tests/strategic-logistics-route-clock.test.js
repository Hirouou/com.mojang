import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics } from '../modules/strategic-logistics.js';

const node = (id, stock = {}) => createLogisticsNode({ id, team: 'ally', stock });
const road = (id, from, to, distance) => createSupplyRoute({ id, team: 'ally', from, to, distance });

test('route previews advance the logistics intel clock monotonically', () => {
  const logistics = createStrategicLogistics({
    nodes: [node('A', { fuel: 5 }), node('B'), node('D')],
    routes: [
      road('A-D', 'A', 'D', 150),
      road('A-B', 'A', 'B', 100),
      road('B-D', 'B', 'D', 100),
    ],
  });

  assert.equal(logistics.reportRouteThreat('A-D', { team: 'ally', threat: .9, reportedAt: 100 }), true);
  assert.deepEqual(logistics.route('ally', 'A', 'D', { now: 100 }).map(leg => leg.routeId), ['A-B', 'B-D']);

  // Once a caller has evaluated routing at a later world time, an older route
  // preview or a dispatch without an explicit timestamp must not revive intel
  // that was already stale at that later time.
  assert.deepEqual(logistics.route('ally', 'A', 'D', { now: 401 }).map(leg => leg.routeId), ['A-D']);
  assert.deepEqual(logistics.route('ally', 'A', 'D', { now: 100 }).map(leg => leg.routeId), ['A-D']);

  const dispatch = logistics.dispatch({ team: 'ally', from: 'A', to: 'D', cargo: { fuel: 5 }, speed: 10 });
  assert.equal(dispatch.ok, true);
  const convoy = logistics.snapshot().convoys.find(item => item.id === dispatch.convoyId);
  assert.deepEqual(convoy.path.map(leg => leg.routeId), ['A-D']);
});
