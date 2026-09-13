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

test('physical cabin stations are gated through the external crew bridge', () => {
  assert.match(source, /ironRainEntry\?\.crewBridge/);
  assert.match(source, /bridge\.requestStation\(station\)/);
  assert.match(source, /bridge\.releaseStation\(station\)/);
  assert.match(source, /if \(!result\?\.ready\) \{/);
  assert.match(source, /pendingCrewStation = result\?\.pending \? station : null/);
  assert.match(source, /return false/);
  assert.match(source, /crewStation:\s*activeCrewStation/);
  assert.doesNotMatch(source, /crew-mqtt-transport|crew-broadcast-transport/);
});