import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCapitalMaterialization } from '../modules/capital-city-view.js';

function fakeCanvas() {
  const calls = { strokes: 0, fills: 0 };
  return {
    calls,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, translate() {}, rotate() {},
    stroke() { calls.strokes += 1; },
    fillRect() { calls.fills += 1; },
  };
}

test('local world materializes canonical capital streets and facilities', () => {
  const ctx = fakeCanvas();
  const state = {
    warSimulation: {
      strategicRoads: [{ id: 'r-1', from: { x: 0, y: 0 }, to: { x: 2_000, y: 0 }, open: true }],
      strategicCapitals: [{
        id: 'strategic-capital:sector-a', strategicSectorId: 'sector-a', x: 0, y: 0,
        team: 'ally', alive: true, level: 3, structures: ['depot', 'garage', 'bunker'],
      }],
    },
  };
  drawCapitalMaterialization(ctx, state, {
    worldToScreen: (x, y) => ({ x, y }),
    visible: () => true,
    zoom: 0.1,
    time: 0,
  });
  assert.ok(ctx.calls.strokes >= 3, 'capital streets should draw from the deterministic city layout');
  assert.ok(ctx.calls.fills >= 4, 'canonical capital structures and civilian lots should materialize locally');
});
