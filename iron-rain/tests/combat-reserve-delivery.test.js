import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlanCycle } from '../modules/combat-reserves.js';
import { createLogisticsNode, createStrategicLogistics, createSupplyRoute } from '../modules/strategic-logistics.js';

function makeFront(team = 'ally') {
  const rear = createLogisticsNode({ id: `${team}-rear`, team, kind: 'depot', assets: { troops: 3 } });
  const front = createLogisticsNode({ id: `${team}-front`, team, kind: 'outpost', assets: { troops: 0 } });
  const strategicLogistics = createStrategicLogistics({
    nodes: [rear, front],
    routes: [createSupplyRoute({ id: `${team}-road`, team, from: rear.id, to: front.id, distance: 100 })],
  });
  const territory = { owner: team, contested: false, structures: ['outpost'] };
  return { rear, front, strategicLogistics, territory };
}

function reserveCycle({ strategicLogistics, territory, team = 'ally', from = `${team}-rear`, to = `${team}-front` }) {
  return combatReservePlanCycle({
    strategicLogistics,
    territory,
    team,
    from,
    to,
    timer: 0,
    fallbackUntil: 0,
    tick: 1,
    strength: 50,
    resetIn: 40,
  });
}

test('an open road cannot materialize reserves before troops physically reach staging', () => {
  const { strategicLogistics, territory } = makeFront('ally');

  const waiting = reserveCycle({ strategicLogistics, territory });
  assert.equal(waiting.routeOpen, true);
  assert.equal(waiting.logistics.availableTroops, 0);
  assert.equal(waiting.ready, false);
  assert.equal(waiting.reason, 'troops');
  assert.equal(waiting.amount, 0);
  assert.equal(waiting.nextTimer, 0);

  const dispatched = strategicLogistics.dispatch({
    team: 'ally',
    from: 'ally-rear',
    to: 'ally-front',
    assets: { troops: 2 },
    speed: 10,
    kind: 'reinforcement',
  });
  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.status, 'moving');

  strategicLogistics.step(5);
  const inTransit = reserveCycle({ strategicLogistics, territory });
  assert.equal(inTransit.logistics.availableTroops, 0);
  assert.equal(inTransit.ready, false);
  assert.equal(inTransit.reason, 'troops');

  const events = strategicLogistics.step(5);
  assert.equal(events.some(event => event.type === 'convoy-arrived' && event.assets.troops === 2), true);

  const arrived = reserveCycle({ strategicLogistics, territory });
  assert.equal(arrived.logistics.availableTroops, 2);
  assert.equal(arrived.ready, true);
  assert.equal(arrived.reason, 'ready');
  assert.equal(arrived.amount, 1);
  assert.equal(arrived.nextTimer, 40);
});

test('delivered-troop reserve gate is symmetric between factions', () => {
  for (const team of ['ally', 'enemy']) {
    const { strategicLogistics, territory, front } = makeFront(team);
    front.assets.troops = 1;
    const result = reserveCycle({ strategicLogistics, territory, team });
    assert.equal(result.ready, true, team);
    assert.equal(result.logistics.availableTroops, 1, team);
    assert.equal(result.amount, 1, team);
  }
});
