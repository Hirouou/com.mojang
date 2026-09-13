import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTerritoryProject, chooseVehicleProduction, territoryOperationalEffects } from '../modules/territory-ai.js';

function node(owner) {
  return {
    id: `${owner}-sector`, owner, contested: false, securedFor: 700,
    activeProject: null,
    vehicleProduction: null,
    stock: { materials: 500, ammo: 100, fuel: 100 },
    assets: { trucks: 0, tanks: 0, troops: 0 },
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

test('allied and enemy AI use the same scarce vehicle-production doctrine', () => {
  const ally = node('ally'), enemy = node('enemy');
  ally.structures.push('garage', 'factory', 'armorWorks');
  enemy.structures.push('garage', 'factory', 'armorWorks');
  const context = { routeOpen: true, frontPressure: .8, armorThreat: .8, armorDemand: .8, logisticsDeficit: .7 };
  const allyPlan = chooseVehicleProduction(ally, context);
  const enemyPlan = chooseVehicleProduction(enemy, context);
  assert.equal(allyPlan?.type, 'truck');
  assert.equal(allyPlan?.type, enemyPlan?.type);
  assert.equal(allyPlan?.reason, enemyPlan?.reason);
});

test('AI cannot plan a tank at a capital without armor industry', () => {
  const capital = node('ally');
  capital.assets.trucks = 3;
  capital.structures.push('garage', 'factory');
  const plan = chooseVehicleProduction(capital, { routeOpen: true, frontPressure: 1, armorThreat: 1, armorDemand: 1 });
  assert.equal(plan, null);
});

test('built structures grant identical operational effects to either faction', () => {
  const ally = node('ally'), enemy = node('enemy');
  ally.structures.push('mortar', 'bunker', 'garage');
  enemy.structures.push('mortar', 'bunker', 'garage');
  assert.deepEqual(territoryOperationalEffects(ally), territoryOperationalEffects(enemy));
});

test('empty territory grants no free combat bonuses or reinforcement support', () => {
  const effects = territoryOperationalEffects({ structures: [] });
  assert.deepEqual(effects, {
    supplyCapacity: 1,
    defensiveCover: 0,
    indirectFire: 0,
    repairSupport: 0,
    armorStaging: false,
    localProduction: false,
    reinforcementSupport: 0,
  });
});
