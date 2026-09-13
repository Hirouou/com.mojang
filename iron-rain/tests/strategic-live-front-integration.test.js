import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strategicFrontPath } from '../modules/strategic-front-pressure.js';

const source = readFileSync(new URL('../modules/strategic-war-live-v3.js', import.meta.url), 'utf8');

test('live strategic renderer derives front from current sector ownership', () => {
  assert.match(source, /import \{ strategicFrontPath \} from '\.\/strategic-front-pressure\.js';/);
  assert.match(source, /const fallback = lineSnapshot\(\);/);
  assert.match(source, /sectors: \[\.\.\.theatre\.records\.values\(\)\]\.map\(\(\{ sector \}\) => sector\)/);
  assert.match(source, /const line = strategicFrontPath\(\{/);
});

test('sector pressure bends supported bands while preserving canonical fallback', () => {
  const fallback = [{ x: 50, y: 0 }, { x: 50, y: 100 }];
  const line = strategicFrontPath({
    width: 100,
    height: 100,
    bands: 2,
    fallback,
    sectors: [
      { x: 30, y: 25, owner: 'ally' },
      { x: 70, y: 25, owner: 'enemy' },
      { x: 35, y: 75, owner: 'ally' },
    ],
  });

  assert.equal(line.length, 2);
  assert.deepEqual(line[0], { x: 50, y: 25, supported: true });
  assert.deepEqual(line[1], { x: 50, y: 75, supported: false });
});
