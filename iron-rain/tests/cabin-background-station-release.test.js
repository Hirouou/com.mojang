import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('backgrounding the app releases pending and occupied crew stations', () => {
  const release = source.match(/function releaseCrewStationsForBackground\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(release, 'shared background release boundary must remain explicit');
  assert.match(release[1], /cancelPendingCrewStation\(\)/);
  assert.match(release[1], /if \(activeCrewStation\) leaveCrewStation\(\);/);

  const visibility = source.match(/function onVisibilityChange\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(visibility, 'visibilitychange boundary must remain explicit');
  assert.match(visibility[1], /visibilityState !== 'hidden'/);
  assert.match(visibility[1], /releaseCrewStationsForBackground\(\)/);
  assert.match(source, /function onPageHide\(\) \{ releaseCrewStationsForBackground\(\); \}/);
  assert.match(source, /document\?\.addEventListener\?\.\('visibilitychange', onVisibilityChange\)/);
  assert.match(source, /document\?\.removeEventListener\?\.\('visibilitychange', onVisibilityChange\)/);
});
