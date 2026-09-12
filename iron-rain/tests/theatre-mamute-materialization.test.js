import test from 'node:test';
import assert from 'node:assert/strict';
import { createTheatreMamuteRoster } from '../modules/theatre-mamutes.js';
import { planMamuteMaterialization } from '../modules/theatre-mamute-materialization.js';

test('keeps only nearby Mamutes in the tactical bubble and leaves the rest strategic', () => {
  const roster = createTheatreMamuteRoster([
    { id: 'ally-1', faction: 'ALIADOS', regionId: 'r1', sectorId: 's1', x: 0, y: 0, crewCount: 2, deployment: 'deployed', ammunitionRef: 'ammo-a' },
    { id: 'ally-2', faction: 'ALIADOS', regionId: 'r1', sectorId: 's1', x: 1200, y: 0, crewCount: 1, deployment: 'moving', ammunitionRef: 'ammo-b' },
    { id: 'axis-1', faction: 'EIXO', regionId: 'r1', sectorId: 's1', x: 2500, y: 0, crewCount: 3, deployment: 'deployed', ammunitionRef: 'ammo-c' },
    { id: 'axis-2', faction: 'EIXO', regionId: 'r2', sectorId: 's9', x: 9000, y: 0, crewCount: 0, deployment: 'moving', ammunitionRef: 'ammo-d' },
  ]);

  const plan = planMamuteMaterialization(roster, 'ally-1', 3200);
  assert.equal(plan.focus.id, 'ally-1');
  assert.equal(plan.radius, 3200);
  assert.deepEqual(plan.nearby.map(record => record.id), ['ally-2', 'axis-1']);
  assert.deepEqual(plan.distant.map(record => record.id), ['axis-2']);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.nearby), true);
  assert.equal(Object.isFrozen(plan.distant), true);
});

test('classification is faction-neutral and uses canonical simulation distance', () => {
  const roster = createTheatreMamuteRoster([
    { id: 'axis-focus', faction: 'EIXO', regionId: 'r1', sectorId: 's1', x: 100, y: 100, crewCount: 1, deployment: 'moving', ammunitionRef: 'ammo-a' },
    { id: 'ally-near', faction: 'ALIADOS', regionId: 'r1', sectorId: 's1', x: 3100, y: 100, crewCount: 2, deployment: 'deployed', ammunitionRef: 'ammo-b' },
  ]);
  const plan = planMamuteMaterialization(roster, 'axis-focus', 3000);
  assert.deepEqual(plan.nearby.map(record => record.id), ['ally-near']);
});

test('fails closed for invalid focus or radius without inventing a tactical bubble', () => {
  const roster = createTheatreMamuteRoster([
    { id: 'ally-1', faction: 'ALIADOS', regionId: 'r1', sectorId: 's1', x: 0, y: 0, crewCount: 1, deployment: 'moving', ammunitionRef: 'ammo-a' },
  ]);
  assert.equal(planMamuteMaterialization(roster, 'missing', 3200), null);
  assert.equal(planMamuteMaterialization(roster, 'ally-1', 0), null);
  assert.equal(planMamuteMaterialization(roster, 'ally-1', NaN), null);
});
