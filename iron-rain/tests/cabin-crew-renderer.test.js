import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('cabin renderer owns one visual bridge for remote crew without networking', () => {
  assert.match(source, /createCabinCrewVisualLayer/);
  assert.match(source, /capacity:\s*2/);
  assert.match(source, /updateRemoteCrew\(remotes/);
  assert.match(source, /crewRemotes/);
  assert.match(source, /crewVisuals\.clear\(\)/);
  assert.match(source, /crewVisuals\.dispose\(\)/);
  assert.doesNotMatch(source, /WebSocket|RTCPeerConnection|BroadcastChannel|createCrewRuntime|createCrewSession/);
});

test('cabin snapshot exposes renderer crew state for QA', () => {
  assert.match(source, /crew:\s*crewVisuals\.snapshot\(\)/);
});
