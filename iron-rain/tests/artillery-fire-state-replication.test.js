import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const integrationPath = new URL('../modules/integration-live.js', import.meta.url);

test('live artillery replication only treats committed launch states as a shot', async () => {
  const source = await readFile(integrationPath, 'utf8');
  const bindFireState = source.slice(source.indexOf('function bindFireState()'), source.indexOf('function installSelectorWhenReady()'));

  assert.match(bindFireState, /text === 'FOGO!' \|\| text === 'EM VOO'/, 'both normal and zero-delay launch states must replicate');
  assert.doesNotMatch(bindFireState, /firing[^;]*CARREGANDO/, 'reload-only CARREGANDO state must never issue a fire command');
  assert.match(bindFireState, /if \(firing && fireArmed\) \{ fireArmed = false; emitLocalShot\(\); \}/, 'one committed local launch should emit one authoritative fire request');
});
