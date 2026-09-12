import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlot } from '../modules/table-map.js';

test('table map teaches the four cardinal bearings from the Mamute', () => {
  const own = { x: 12000, y: 18000 };
  assert.deepEqual(calculatePlot(own, { x: 12000, y: 13000 }), { dx: 0, dy: -5000, distance: 5000, azimuth: 0 });
  assert.equal(calculatePlot(own, { x: 17000, y: 18000 }).azimuth, 90);
  assert.equal(calculatePlot(own, { x: 12000, y: 23000 }).azimuth, 180);
  assert.equal(calculatePlot(own, { x: 7000, y: 18000 }).azimuth, 270);
});

test('table map reports manual delta signs and never mutates the coordinate snapshot', () => {
  const own = Object.freeze({ x: 4660, y: 8810 });
  const target = Object.freeze({ x: 20600, y: 8220 });
  const plot = calculatePlot(own, target);
  assert.equal(plot.dx, 15940);
  assert.equal(plot.dy, -590);
  assert.equal(Math.round(plot.distance), 15951);
  assert.ok(plot.azimuth > 87 && plot.azimuth < 90);
  assert.deepEqual(own, { x: 4660, y: 8810 });
  assert.deepEqual(target, { x: 20600, y: 8220 });
});

test('table map handles a zero-length paper course without inventing an azimuth', () => {
  const point = { x: 80000, y: 60000 };
  const plot = calculatePlot(point, point);
  assert.equal(plot.distance, 0);
  assert.equal(plot.azimuth, null);
});
