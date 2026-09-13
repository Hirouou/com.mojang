import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('local Mamute impacts feed the live 3D hull impact presentation', () => {
  assert.match(source, /import \{ hullImpactFeedback \} from '\.\/cabin-hit-feedback\.js';/);
  assert.match(source, /function onLocalHullImpact\(event\) \{\s*applyHullImpact\(hullImpactFeedback\(event\?\.detail \|\| \{\}\)\);\s*\}/s);
  assert.match(source, /addEventListener\?\.\('ironrain:mamute-impact', onLocalHullImpact\)/);
  assert.match(source, /function applyHullImpact\(feedback\) \{[\s\S]*remoteImpact = Math\.max\(remoteImpact, feedback\.intensity\);[\s\S]*hullImpactVisual\.kick\(feedback\.intensity\);[\s\S]*\}/);
});

test('local and replicated impacts share one renderer seam and listener is disposed', () => {
  assert.match(source, /if \(effect\.type === 'impact' \|\| effect\.type === 'critical'\) \{\s*applyHullImpact\(remoteHullImpactFeedback\(effect\)\);\s*\}/s);
  assert.match(source, /removeEventListener\?\.\('ironrain:mamute-impact', onLocalHullImpact\)/);
});
