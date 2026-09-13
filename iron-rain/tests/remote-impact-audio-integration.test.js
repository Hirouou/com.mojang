import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { remoteHullImpactFeedback } from '../modules/remote-hull-impact-feedback.js';

const source = await readFile(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

test('replicated hull audio uses the same canonical feedback as cabin shake', () => {
  assert.match(source, /import \{ remoteHullImpactFeedback \} from '\.\/remote-hull-impact-feedback\.js';/);
  assert.match(source, /const feedback = remoteHullImpactFeedback\(effect\);/);
  assert.match(source, /audio\.impact\(feedback \|\| effect\.payload \|\| effect\);/);

  const rifle = remoteHullImpactFeedback({ type: 'impact', payload: { damage: 2, kind: 'rifle' } });
  const heavy = remoteHullImpactFeedback({ type: 'impact', payload: { damage: 18, kind: 'tank' } });
  assert.ok(rifle);
  assert.ok(heavy);
  assert.ok(heavy.intensity > rifle.intensity);
  assert.ok(heavy.lowThump >= rifle.lowThump);
  assert.ok(heavy.metalRattle >= rifle.metalRattle);
});

test('critical replicated impact keeps full canonical audio intensity', () => {
  const critical = remoteHullImpactFeedback({ type: 'critical', payload: { damage: 1, kind: 'rifle', intensity: .05 } });
  assert.equal(critical.intensity, 1);
});
