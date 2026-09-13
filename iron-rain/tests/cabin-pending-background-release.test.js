import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('pending crew station claims are tracked and cancelled when the app backgrounds', () => {
  assert.match(source, /let pendingCrewStation = null;/);
  assert.match(source, /pendingCrewStation = result\?\.pending \? station : null;/);

  const cancel = source.match(/function cancelPendingCrewStation\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(cancel, 'pending station cancellation boundary must remain explicit');
  assert.match(cancel[1], /releaseCrewStation\(station\)/);
  assert.match(cancel[1], /pendingCrewStation = null/);

  const release = source.match(/function releaseCrewStationsForBackground\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(release, 'shared background release boundary must remain explicit');
  assert.match(release[1], /cancelPendingCrewStation\(\)/);
  assert.match(release[1], /if \(activeCrewStation\) leaveCrewStation\(\)/);

  const visibility = source.match(/function onVisibilityChange\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(visibility, 'visibilitychange boundary must remain explicit');
  assert.match(visibility[1], /visibilityState !== 'hidden'/);
  assert.match(visibility[1], /releaseCrewStationsForBackground\(\)/);
});

test('reset and dispose cannot strand a pending station claim', () => {
  assert.match(source, /reset\(\) \{\s*if \(pendingCrewStation\) releaseCrewStation\(pendingCrewStation\);/);
  assert.match(source, /dispose\(\) \{\s*if \(pendingCrewStation\) releaseCrewStation\(pendingCrewStation\);/);
  assert.match(source, /pendingCrewStation,/);
});
