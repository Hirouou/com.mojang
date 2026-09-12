import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTerritoryProject, territoryOperationalEffects } from '../modules/territory-ai.js';

function node(owner) {
  return {
    id: `${owner}-sector`, owner, contested: false, securedFor: 700,
    activeProject: null,
    stock: { materials: 500, ammo: 100, fuel: 100 },
    structures: ['outpost', 'depot'],
  };
}

test('allied and enemy AI use the same construction doctrine and thresholds', () => {
  const context = { routeOpen: true, frontPressure: .7, armorThreat: .6, infantryThreat: .8 };
  const ally = chooseTerritoryProject(node('ally'), context);
  const enemy = chooseTerritoryProject(node('enemy'), context);
  assert.equal(ally?.type, enemy?.type);
  assert.equal(ally?.reason, enemy?.reason);
});

test('built structures grant identical operational effects to either faction', () => {
  const ally = node('ally'), enemy = node('enemy');
  ally.structures.push('mortar', 'bunker', 'garage');
  enemy.structures.push('mortar', 'bunker', 'garage');
  assert.deepEqual(territoryOperationalEffects(ally), territoryOperationalEffects(enemy));
});
