import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPointerSettings, pointerDistance, precisePlotPoint, precisePanView } from '../modules/map-touch-precision.js';

test('touch gets deadzone and lower drag gain while mouse stays one-to-one', () => {
  assert.deepEqual(mapPointerSettings('mouse'), { coarse: false, deadzonePx: 0, plotGain: 1, panGain: 1 });
  const touch = mapPointerSettings('touch');
  assert.equal(touch.coarse, true);
  assert.ok(touch.deadzonePx >= 6);
  assert.ok(touch.plotGain < 1);
  assert.ok(touch.panGain < 1);
});

test('touch plotting moves less world distance for the same finger drag', () => {
  const base = { startScreen: { x: 100, y: 100 }, currentScreen: { x: 140, y: 120 }, startWorld: { x: 10000, y: 20000 }, scale: .01 };
  const mouse = precisePlotPoint({ ...base, pointerType: 'mouse' });
  const touch = precisePlotPoint({ ...base, pointerType: 'touch' });
  assert.ok(Math.abs(touch.x - 10000) < Math.abs(mouse.x - 10000));
  assert.ok(Math.abs(touch.y - 20000) < Math.abs(mouse.y - 20000));
});

test('touch panning damps movement without reversing direction', () => {
  const base = { startScreen: { x: 50, y: 50 }, currentScreen: { x: 90, y: 70 }, startView: { x: 40000, y: 30000 }, scale: .01 };
  const mouse = precisePanView({ ...base, pointerType: 'mouse' });
  const touch = precisePanView({ ...base, pointerType: 'touch' });
  assert.ok(touch.x < 40000 && touch.y < 30000);
  assert.ok(Math.abs(touch.x - 40000) < Math.abs(mouse.x - 40000));
});

test('distance helper is stable for missing or invalid coordinates', () => {
  assert.equal(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.ok(Number.isFinite(pointerDistance({}, { x: Infinity, y: NaN })));
});
