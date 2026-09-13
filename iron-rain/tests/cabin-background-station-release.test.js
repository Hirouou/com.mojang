import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('backgrounding the app releases an occupied crew station', () => {
  const match = source.match(/function onVisibilityChange\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, 'visibilitychange boundary must remain explicit');
  const body = match[1];

  assert.match(body, /visibilityState !== 'hidden'/);
  assert.match(body, /!activeCrewStation/);
  assert.match(body, /leaveCrewStation\(\);/);
  assert.match(source, /document\?\.addEventListener\?\.\('visibilitychange', onVisibilityChange\)/);
  assert.match(source, /document\?\.removeEventListener\?\.\('visibilitychange', onVisibilityChange\)/);
});
