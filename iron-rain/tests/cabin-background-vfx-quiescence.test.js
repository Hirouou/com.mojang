import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('background lifecycle clears transient cabin impact presentation', () => {
  assert.match(source, /function quiesceTransientCabinVfx\(\) \{[\s\S]*remoteRecoil = 0;[\s\S]*remoteImpact = 0;[\s\S]*hullImpactVisual\.reset\(\);[\s\S]*canvas\.style\.transform = '';[\s\S]*canvas\.style\.filter = '';[\s\S]*\}/);
  assert.match(source, /function releaseCrewStationsForBackground\(\) \{\s*quiesceTransientCabinVfx\(\);/s);
});

test('both hidden visibility and pagehide use the shared background cleanup seam', () => {
  assert.match(source, /if \(globalThis\.document\?\.visibilityState !== 'hidden'\) return;\s*releaseCrewStationsForBackground\(\);/s);
  assert.match(source, /function onPageHide\(\) \{ releaseCrewStationsForBackground\(\); \}/);
});
