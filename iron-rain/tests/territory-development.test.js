import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerritoryNode, setTerritoryControl, receiveTerritoryDelivery, startTerritoryProject, stepTerritoryDevelopment, createSupplyConvoy, stepSupplyConvoy, canStartVehicleProduction, startVehicleProduction } from '../modules/territory-development.js';

test('captured territory cannot build until it is secure and a truck delivery arrived', () => {
  const node = createTerritoryNode({ id: 'A1', owner: 'ally' });
  setTerritoryControl(node, 'ally', { contested: false, dt: 50 });
  assert.equal(startTerritoryProject(node, 'outpost').reason, 'materials-not-delivered');
  assert.equal(receiveTerritoryDelivery(node, { team: 'ally', cargo: { materials: 40 } }), true);
  assert.equal(startTerritoryProject(node, 'outpost').ok, true);
  stepTerritoryDevelopment(node, 35, { routeOpen: true, contested: false });
  assert.deepEqual(node.structures, ['outpost']);
});

test('cut supply route pauses active construction', () => {
  const node = createTerritoryNode({ id: 'A2', owner: 'enemy' });
  setTerritoryControl(node, 'enemy', { contested: false, dt: 200 });
  receiveTerritoryDelivery(node, { team: 'enemy', cargo: { materials: 50 } });
  startTerritoryProject(node, 'outpost');
  stepTerritoryDevelopment(node, 20, { routeOpen: false, contested: false });
  assert.equal(node.projectProgress, 0);
  stepTerritoryDevelopment(node, 20, { routeOpen: true, contested: false });
  assert.equal(node.projectProgress, 20);
});

test('convoy must physically arrive before destination can receive its cargo', () => {
  const convoy = createSupplyConvoy({ id: 'truck-1', team: 'ally', from: 'HQ', to: 'A3', cargo: { materials: 100 }, distance: 140, speed: 14 });
  assert.equal(stepSupplyConvoy(convoy, 4, { routeOpen: false }), 'blocked');
  assert.equal(convoy.travelled, 0);
  assert.equal(stepSupplyConvoy(convoy, 5, { routeOpen: true }), 'moving');
  assert.equal(convoy.travelled, 70);
  assert.equal(stepSupplyConvoy(convoy, 5, { routeOpen: true }), 'arrived');
});

test('factory produces transferable materials but does not auto-build another territory', () => {
  const node = createTerritoryNode({ id: 'A4', owner: 'ally' });
  node.contested = false;
  node.structures.push('outpost', 'depot', 'garage', 'factory');
  const result = stepTerritoryDevelopment(node, 60, { routeOpen: true, contested: false });
  assert.ok(result.produced > 0);
  assert.ok(node.stock.materials > 0);
  assert.equal(node.activeProject, null);
});

test('truck production requires a real garage and consumes scarce local stock', () => {
  const node = createTerritoryNode({ id: 'CAP-TRUCK', owner: 'ally', stock: { materials: 100, fuel: 60 } });
  node.contested = false;
  assert.equal(canStartVehicleProduction(node, 'truck').reason, 'missing-production-facility');
  node.structures.push('garage');
  const order = startVehicleProduction(node, 'truck');
  assert.equal(order.ok, true);
  assert.equal(node.stock.materials, 45);
  assert.equal(node.stock.fuel, 42);
  stepTerritoryDevelopment(node, 44, { routeOpen: true, contested: false });
  assert.equal(node.assets.trucks, 0);
  stepTerritoryDevelopment(node, 1, { routeOpen: true, contested: false });
  assert.equal(node.assets.trucks, 1);
});

test('tank cannot be produced at an ordinary capital without armor works', () => {
  const node = createTerritoryNode({ id: 'CAP-NO-ARMOR', owner: 'enemy', stock: { materials: 500, ammo: 200, fuel: 200 } });
  node.contested = false;
  node.structures.push('outpost', 'depot', 'garage', 'factory');
  const check = canStartVehicleProduction(node, 'tank');
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'missing-production-facility');
  assert.equal(node.assets.tanks, 0);
});

test('tank is created only after armor works, stock payment and production time', () => {
  const node = createTerritoryNode({ id: 'CAP-ARMOR', owner: 'ally', stock: { materials: 250, ammo: 80, fuel: 100 } });
  node.contested = false;
  node.structures.push('garage', 'factory', 'armorWorks');
  const order = startVehicleProduction(node, 'tank');
  assert.equal(order.ok, true);
  assert.deepEqual(node.stock, { materials: 60, ammo: 44, fuel: 28 });
  stepTerritoryDevelopment(node, 120, { routeOpen: true, contested: false });
  assert.equal(node.assets.tanks, 0);
  stepTerritoryDevelopment(node, 15, { routeOpen: true, contested: false });
  assert.equal(node.assets.tanks, 1);
  assert.equal(node.vehicleProduction, null);
});

test('tank production fails closed when local resources are insufficient', () => {
  const node = createTerritoryNode({ id: 'CAP-POOR', owner: 'ally', stock: { materials: 189, ammo: 36, fuel: 72 } });
  node.contested = false;
  node.structures.push('armorWorks');
  const result = startVehicleProduction(node, 'tank');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'production-stock-insufficient');
  assert.equal(node.assets.tanks, 0);
});
