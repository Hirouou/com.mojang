import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crewLobbySessionLocked } from '../modules/crew-lobby-ui.js';

const root = new URL('../', import.meta.url);

test('crew lobby locks room and faction only after the Mamute session becomes authoritative', () => {
  assert.equal(crewLobbySessionLocked({ mode: 'offline' }), false);
  assert.equal(crewLobbySessionLocked({ mode: 'guest', connected: false }), false);
  assert.equal(crewLobbySessionLocked({ mode: 'guest', connected: true }), true);
  assert.equal(crewLobbySessionLocked({ mode: 'host', connected: false }), true);
});

test('connected lobby disables identity-changing controls while preserving enter flow', async () => {
  const source = await readFile(new URL('modules/crew-lobby-ui.js', root), 'utf8');
  assert.match(source, /factionButtons\.forEach\(button => \{ button\.disabled = locked; \}\)/);
  assert.match(source, /input\.readOnly = locked/);
  assert.match(source, /hostButton\.disabled = locked \|\| !ready/);
  assert.match(source, /joinButton\.disabled = locked \|\| !ready/);
  assert.match(source, /offlineButton\.disabled = locked \|\| !ready/);
  assert.match(source, /enter\.disabled = !selectedFaction \|\| \(!connected && next\.mode !== 'offline'\)/);
  assert.match(source, /sessão travada neste Mamute/);
});
