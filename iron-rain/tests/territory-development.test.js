import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerritoryNode, setTerritoryControl, receiveTerritoryDelivery, startTerritoryProject, stepTerritoryDevelopment, createSupplyConvoy, stepSupplyConvoy } from '../modules/territory-development.js';

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
