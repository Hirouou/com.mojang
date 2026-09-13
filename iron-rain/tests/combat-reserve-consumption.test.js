import test from 'node:test';
import assert from 'node:assert/strict';
import { combatReservePlanCycle } from '../modules/combat-reserves.js';
import { createLogisticsNode, createStrategicLogistics, createSupplyRoute } from '../modules/strategic-logistics.js';

function makeFront(team = 'ally', troops = 2) {
  const rear = createLogisticsNode({ id: `${team}-rear`, team, kind: 'depot', assets: { troops: 10 } });
  const front = createLogisticsNode({ id: `${team}-front`, team, kind: 'outpost', assets: { troops } });
  const strategicLogistics = createStrategicLogistics({
    nodes: [rear, front],
    routes: [createSupplyRoute({ id: `${team}-road`, team, from: rear.id, to: front.id, distance: 100 })],
  });
  const territory = { owner: team, contested: false, structures: ['outpost'] };
  return { front, strategicLogistics, territory };
}

function dueCycle({ strategicLogistics, territory, team = 'ally', to = `${team}-front` }) {
  return combatReservePlanCycle({
    strategicLogistics,
    territory,
    team,
    from: `${team}-rear`,
    to,
    timer: 0,
    fallbackUntil: 0,
    tick: 1,
    strength: 50,
    resetIn: 40,
  });
}

test('accepted reserve cycle consumes the delivered troop from canonical staging inventory', () => {
  const { front, strategicLogistics, territory } = makeFront('ally', 2);
  const result = dueCycle({ strategicLogistics, territory });

  assert.equal(result.ready, true);
  assert.equal(result.amount, 1);
  assert.equal(result.logistics.availableTroops, 2);
  assert.equal(result.remainingTroops, 1);
  assert.equal(front.assets.troops, 1);
});

test('delivered troops cannot be reused by later due reserve cycles', () => {
  const { front, strategicLogistics, territory } = makeFront('ally', 1);

  const first = dueCycle({ strategicLogistics, territory });
  assert.equal(first.ready, true);
  assert.equal(first.amount, 1);
  assert.equal(front.assets.troops, 0);

  const second = dueCycle({ strategicLogistics, territory });
  assert.equal(second.ready, false);
  assert.equal(second.reason, 'troops');
  assert.equal(second.amount, 0);
  assert.equal(second.nextTimer, 0);
  assert.equal(front.assets.troops, 0);
});

test('physical reserve consumption stays symmetric between factions', () => {
  for (const team of ['ally', 'enemy']) {
    const { front, strategicLogistics, territory } = makeFront(team, 1);
    const result = dueCycle({ strategicLogistics, territory, team });
    assert.equal(result.ready, true, team);
    assert.equal(result.amount, 1, team);
    assert.equal(result.remainingTroops, 0, team);
    assert.equal(front.assets.troops, 0, team);
  }
});
