import test from 'node:test';
import assert from 'node:assert/strict';
import { strategicRoadWorldPolyline, drawWarInfrastructure } from '../modules/battlefield-view.js';

function canvas() {
  const ctx = { depth: 0, paths: [], translations: [], globalAlpha: 1, path: [],
    save() { this.depth++; }, restore() { this.depth--; assert.ok(this.depth >= 0); },
    beginPath() { this.path = []; }, moveTo(x, y) { this.path.push({ x, y }); }, lineTo(x, y) { this.path.push({ x, y }); },
    stroke() { this.paths.push(this.path.map(point => ({ ...point }))); }, fill() {}, closePath() {},
    translate(x, y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); this.translations.push({ x, y }); },
    rotate() {}, scale() {}, fillRect() {}, strokeRect() {}, ellipse() {}, arc() {}, fillText() {}, setLineDash() {},
  };
  return ctx;
}
const road = { id: 'supply-route-12', from: { x: 17500, y: 21200 }, to: { x: 20700, y: 22400 }, open: true };
const frame = (zoom = 1) => ({ zoom, time: 20, width: 1280, height: 720, worldToScreen: (x, y) => ({ x: (x - 19000) * zoom + 640, y: (y - 22000) * zoom + 360 }) });

test('road shape and erosion samples are anchored to canonical world coordinates across zoom levels', () => {
  const worldPoints = strategicRoadWorldPolyline(road);
  assert.deepEqual(worldPoints[0], road.from);
  assert.ok(Math.hypot(worldPoints.at(-1).x - road.to.x, worldPoints.at(-1).y - road.to.y) < 1e-8);
  assert.deepEqual(strategicRoadWorldPolyline(structuredClone(road)), worldPoints);
  let samples;
  for (const zoom of [.03, .15, .7, 2.4]) {
    const ctx = canvas();
    drawWarInfrastructure(ctx, { sectors: [], warSimulation: { strategicRoads: [road] } }, frame(zoom));
    const restored = ctx.paths[0].map(point => ({ x: (point.x - 640) / zoom + 19000, y: (point.y - 360) / zoom + 22000 }));
    assert.equal(restored.length, worldPoints.length);
    restored.forEach((point, index) => assert.ok(Math.hypot(point.x - worldPoints[index].x, point.y - worldPoints[index].y) < 1e-8));
    const ruts = ctx.paths.slice(3, 5).flat().map(point => ({ x: (point.x - 640) / zoom + 19000, y: (point.y - 360) / zoom + 22000 }));
    if (samples) ruts.forEach((point, index) => assert.ok(Math.hypot(point.x - samples[index].x, point.y - samples[index].y) < 1e-8));
    samples = ruts;
    assert.equal(ctx.depth, 0);
  }
});

test('visibility culling keeps a visible road after the first 48 route records', () => {
  const hidden = Array.from({ length: 64 }, (_, i) => ({ id: `hidden-${i}`, from: { x: -90000 - i * 10, y: 0 }, to: { x: -89000 - i * 10, y: 0 } }));
  const ctx = canvas();
  drawWarInfrastructure(ctx, { sectors: [], warSimulation: { strategicRoads: [...hidden, road] } }, { ...frame(), visible: x => x > 0 });
  assert.ok(ctx.paths.length >= 5);
  assert.equal(ctx.paths[0].length, strategicRoadWorldPolyline(road).length);
  assert.equal(ctx.depth, 0);
});

test('authority air snapshot renders fighters, AA and effects and deduplicates core bombers', () => {
  const ctx = canvas(), bomber = { id: 'bomber', type: 'bomber', team: 'enemy', x: 19000, y: 22000, life: 8, hp: 90 };
  const state = { sectors: [], serverMamute: { faction: 'axis' }, warSimulation: { support: [bomber] }, serverAirWar: {
    aircraft: [bomber, { id: 'fighter', type: 'fighter', team: 'ally', x: 19300, y: 22000, life: 60 }],
    batteries: [{ id: 'aa', type: 'AA', x: 18700, y: 22000, team: 'enemy', alive: true, hp: 100, flash: .2 }],
    effects: [{ type: 'flak', x: 18700, y: 22000, x2: 19300, y2: 22000, life: .5, max: .7 }],
  } };
  drawWarInfrastructure(ctx, state, frame());
  assert.equal(ctx.translations.filter(point => point.x === 640 && point.y === 360).length, 1, 'shared bomber draws once');
  assert.ok(ctx.translations.some(point => point.x === 940 && point.y === 360), 'server-observed opposing fighter remains visible');
  assert.ok(ctx.translations.some(point => point.x === 340 && point.y === 360), 'AA battery renders from server coordinates');
  assert.equal(ctx.depth, 0);
});

test('invalid road endpoints do not create nonfinite canvas geometry', () => {
  assert.deepEqual(strategicRoadWorldPolyline({ from: { x: NaN, y: 0 }, to: { x: 0, y: 0 } }), []);
  const ctx = canvas();
  assert.doesNotThrow(() => drawWarInfrastructure(ctx, { warSimulation: { strategicRoads: [{ from: {}, to: {} }] } }, frame()));
  assert.equal(ctx.depth, 0);
});
