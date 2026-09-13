import test from 'node:test';
import assert from 'node:assert/strict';

import { releaseTerminalConvoyFlight } from '../modules/strategic-war-live-v3.js';

test('destroyed convoy releases its strategic in-flight lock', () => {
  const inFlight = new Map([
    ['supply:front-a', 'convoy-lost'],
    ['armor:front-b', 'convoy-safe'],
    ['return:front-c', 'convoy-lost'],
  ]);

  assert.equal(releaseTerminalConvoyFlight(inFlight, { type: 'convoy-destroyed', convoyId: 'convoy-lost' }), true);
  assert.deepEqual([...inFlight.entries()], [['armor:front-b', 'convoy-safe']]);
});

test('arrival releases a lock but non-terminal convoy events do not', () => {
  const inFlight = new Map([['troops:front-a', 'convoy-1']]);

  assert.equal(releaseTerminalConvoyFlight(inFlight, { type: 'convoy-blocked', convoyId: 'convoy-1' }), false);
  assert.equal(inFlight.has('troops:front-a'), true);
  assert.equal(releaseTerminalConvoyFlight(inFlight, { type: 'convoy-arrived', convoyId: 'convoy-1' }), true);
  assert.equal(inFlight.size, 0);
});
