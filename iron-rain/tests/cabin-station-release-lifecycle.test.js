import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');
const leaveBody = source.match(/function leaveCrewStation\(\) \{([\s\S]*?)\n  \}\n\n  view =/)?.[1] || '';

test('cabin keeps the local station until authoritative release succeeds', () => {
  assert.match(leaveBody, /if \(!releaseCrewStation\(activeCrewStation\)\) return false;/);

  const releaseGate = leaveBody.indexOf('if (!releaseCrewStation(activeCrewStation)) return false;');
  const clearLocal = leaveBody.indexOf('activeCrewStation = null;');
  const leaveCore = leaveBody.indexOf('return core.leaveStation?.();');

  assert.ok(releaseGate >= 0, 'leave flow must fail closed on release denial');
  assert.ok(clearLocal > releaseGate, 'local ownership must clear only after release succeeds');
  assert.ok(leaveCore > clearLocal, 'physical station exit must happen only after authority release');
});
