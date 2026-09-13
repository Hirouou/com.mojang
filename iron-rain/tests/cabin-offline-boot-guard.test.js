import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('cabin boot stays on canonical crew-aware renderer path', () => {
  assert.doesNotMatch(source, /ironRainEntry\?\.mode === 'offline'/, 'cabin must not fork into a separate offline renderer path');
  assert.match(source, /createCabinViewCore\(canvas, gatedOptions\)/, 'core cabin must boot through crew-aware gated options');
  assert.match(source, /createCabinCrewVisualLayer\(scene, \{ capacity: 2 \}\)/, 'crew visuals must remain attached to the canonical cabin scene');
});
