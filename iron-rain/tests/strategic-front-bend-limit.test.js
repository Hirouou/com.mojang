import test from 'node:test';
import assert from 'node:assert/strict';
import { strategicFrontPath } from '../modules/strategic-front-pressure.js';

test('live front pressure cannot drag a supported band beyond the canonical bend limit', () => {
  const path = strategicFrontPath({
    width: 1000,
    height: 1000,
    bands: 2,
    maxBend: 80,
    fallback: [
      { x: 400, y: 0 },
      { x: 400, y: 1000 },
    ],
    sectors: [
      { x: 760, y: 100, owner: 'ally' },
      { x: 940, y: 120, owner: 'enemy' },
      { x: 300, y: 700, owner: 'ally' },
    ],
  });

  assert.deepEqual(path, [
    { x: 480, y: 250, supported: true },
    { x: 400, y: 750, supported: false },
  ]);
});

test('zero bend keeps supported sector evidence anchored to the canonical line', () => {
  const [sample] = strategicFrontPath({
    width: 1000,
    height: 500,
    bands: 2,
    maxBend: 0,
    fallback: [
      { x: 425, y: 0 },
      { x: 425, y: 500 },
    ],
    sectors: [
      { x: 600, y: 50, owner: 'ally' },
      { x: 900, y: 80, owner: 'enemy' },
    ],
  });

  assert.equal(sample.supported, true);
  assert.equal(sample.x, 425);
});
