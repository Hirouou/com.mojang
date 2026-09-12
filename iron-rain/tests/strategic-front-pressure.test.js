import test from 'node:test';
import assert from 'node:assert/strict';
import { strategicFrontPath, strategicFrontPressure } from '../modules/strategic-front-pressure.js';

test('front pressure follows the gap between friendly and enemy sector edges', () => {
  const samples = strategicFrontPressure({
    width: 1000,
    height: 1000,
    bands: 2,
    sectors: [
      { x: 350, y: 100, owner: 'ally' },
      { x: 420, y: 200, owner: 'ally' },
      { x: 610, y: 180, owner: 'enemy' },
      { x: 700, y: 250, owner: 'enemy' },
      { x: 300, y: 700, owner: 'ally' },
      { x: 760, y: 720, owner: 'enemy' },
    ],
  });

  assert.equal(samples.length, 2);
  assert.equal(samples[0].supported, true);
  assert.equal(samples[0].allyEdge, 420);
  assert.equal(samples[0].enemyEdge, 610);
  assert.equal(samples[0].x, 515);
  assert.equal(samples[1].x, 530);
});

test('unsupported or crossed bands fail back to the neutral baseline', () => {
  const samples = strategicFrontPressure({
    width: 1000,
    height: 1000,
    bands: 2,
    sectors: [
      { x: 620, y: 100, owner: 'ally' },
      { x: 580, y: 120, owner: 'enemy' },
      { x: 250, y: 700, owner: 'neutral' },
    ],
  });

  assert.equal(samples[0].supported, false);
  assert.equal(samples[0].x, 500);
  assert.equal(samples[1].supported, false);
  assert.equal(samples[1].x, 500);
});

test('front path keeps canonical line where sector evidence is incomplete', () => {
  const path = strategicFrontPath({
    width: 1000,
    height: 1000,
    bands: 2,
    fallback: [
      { x: 400, y: 0 },
      { x: 600, y: 1000 },
    ],
    sectors: [
      { x: 350, y: 100, owner: 'ally' },
      { x: 650, y: 120, owner: 'enemy' },
      { x: 300, y: 700, owner: 'ally' },
    ],
  });

  assert.deepEqual(path, [
    { x: 500, y: 250, supported: true },
    { x: 550, y: 750, supported: false },
  ]);
});

test('crossed ownership never bends the path through an invalid pocket', () => {
  const path = strategicFrontPath({
    width: 1000,
    height: 1000,
    bands: 2,
    fallback: [
      { x: 450, y: 0 },
      { x: 450, y: 1000 },
    ],
    sectors: [
      { x: 700, y: 100, owner: 'ally' },
      { x: 300, y: 120, owner: 'enemy' },
    ],
  });

  assert.equal(path[0].supported, false);
  assert.equal(path[0].x, 450);
});

test('invalid theatre dimensions fail closed', () => {
  assert.deepEqual(strategicFrontPressure({ width: 0, height: 1000, sectors: [] }), []);
  assert.deepEqual(strategicFrontPressure({ width: 1000, height: NaN, sectors: [] }), []);
  assert.deepEqual(strategicFrontPath({ width: 0, height: 1000, sectors: [] }), []);
});
