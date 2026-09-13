import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapitalLayout, distanceToCapitalRoad } from '../modules/capital-city-layout.js';
import { collectCapitalLayouts, createCapitalVisualPlan, drawCapitalCities, drawCapitalLayout } from '../modules/capital-city-renderer.js';
import { drawWarInfrastructure } from '../modules/battlefield-view.js';

function mockContext() {
  const gradient = { addColorStop() {} };
  const ctx = {
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {},
    fillRect() {}, strokeRect() {}, ellipse() {}, arc() {}, translate() {}, scale() {}, rotate() {}, setLineDash() {},
    createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; },
  };
  return ctx;
}

const frame = Object.freeze({
  zoom: .08,
  time: 0,
  worldToScreen: (x, y) => ({ x: x * .08, y: y * .08 }),
  visible: () => true,
});

const developed = () => buildCapitalLayout({
  id: 'CAP-VISUAL-TEST', x: 5200, y: 4100, roadBearings: [.1, 1.06],
  structures: ['depot','resourceWarehouse','garage','infirmary','factory','armorWorks','bunker','antiAir'],
  density: 30,
});

test('capital renderer accepts an empty/uninitialized layout', () => {
  const ctx = mockContext();
  assert.doesNotThrow(() => drawCapitalLayout(ctx, null, frame));
  const empty = { id: 'empty', center: { x: 0, y: 0 }, radius: 100, roads: [], lots: [], structures: [], civilian: [] };
  assert.deepEqual(drawCapitalLayout(ctx, empty, frame), { roads: 0, structures: 0, civilian: 0 });
});

test('capital renderer accepts and plans a developed city', () => {
  const layout = developed();
  const plan = createCapitalVisualPlan(layout, { team: 'ally' });
  assert.ok(plan.roads.length >= 2);
  assert.ok(plan.structures.some(item => item.type === 'capitalHQ'));
  assert.ok(plan.structures.some(item => item.type === 'depot'));
  assert.ok(plan.civilian.length > 0);
  const result = drawCapitalLayout(mockContext(), layout, frame, { team: 'ally' });
  assert.ok(result.roads >= 2);
  assert.ok(result.structures >= 4);
  assert.ok(result.civilian > 0);
});

test('visual plan refuses non-HQ structures placed on a shared-layout road', () => {
  const layout = {
    id: 'road-overlap', seed: 77, center: { x: 0, y: 0 }, radius: 300,
    rules: { primaryWidth: 40, shoulderWidth: 10 },
    roads: [{ id: 'r1', width: 40, shoulder: 10, points: [{ x: -250, y: 0 }, { x: 250, y: 0 }] }],
    lots: [], civilian: [],
    structures: [
      { id: 'bad', type: 'depot', x: 0, y: 0, angle: 0, width: 100, height: 70 },
      { id: 'safe', type: 'garage', x: 0, y: 120, angle: 0, width: 100, height: 70 },
    ],
  };
  const plan = createCapitalVisualPlan(layout, {});
  assert.equal(plan.structures.some(item => item.id === 'bad'), false);
  assert.equal(plan.structures.some(item => item.id === 'safe'), true);
  assert.equal(distanceToCapitalRoad(layout, layout.structures[0]), 0);
});

test('active project is a construction site instead of a completed building', () => {
  const layout = buildCapitalLayout({ id: 'project-capital', x: 1000, y: 1000, structures: ['depot'], density: 14 });
  const plan = createCapitalVisualPlan(layout, { activeProject: 'factory', projectProgress: .42 });
  assert.equal(plan.structures.some(item => item.type === 'factory'), false);
  assert.equal(plan.construction?.type, 'factory');
  assert.equal(plan.construction?.progress, .42);
});

test('capital draw/collection does not mutate simulation state', () => {
  const state = {
    time: 12,
    robot: { x: 5100, y: 4100 },
    cam: { zoom: .08, mode: 'march' },
    warSimulation: { strategicRoads: [{ id: 'RT-1', from: { x: 3000, y: 4100 }, to: { x: 7000, y: 4100 }, open: true }], strategicTraffic: [], support: [] },
    sectors: [{ id: 'S1', name: 'Capital Teste', x: 5200, y: 4100, owner: 'ally', structures: ['depot','garage','bunker'], war: { bases: [], vehicles: [], mortars: [] } }],
  };
  const before = structuredClone(state);
  const layouts = collectCapitalLayouts(state);
  assert.equal(layouts.length, 1);
  drawCapitalCities(mockContext(), state, frame);
  drawWarInfrastructure(mockContext(), state, frame);
  assert.deepEqual(state, before);
});

test('battlefield renderer tolerates strategic system not initialized yet', () => {
  const ctx = mockContext();
  assert.deepEqual(collectCapitalLayouts({}), []);
  assert.doesNotThrow(() => drawCapitalCities(ctx, {}, frame));
  assert.doesNotThrow(() => drawWarInfrastructure(ctx, {}, frame));
  assert.doesNotThrow(() => drawWarInfrastructure(ctx, { sectors: [] }, frame));
});
