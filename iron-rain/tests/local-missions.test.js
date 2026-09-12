import test from 'node:test';
import assert from 'node:assert/strict';
import { localMissionFeed, missionInWeaponRange } from '../modules/local-missions.js';

test('normal field missions are delivered near the player instead of across the whole world', () => {
  const feed = localMissionFeed({
    playerPosition: { x: 0, y: 0 },
    missions: [
      { id: 'near', x: 5_000, y: 0, priority: 1 },
      { id: 'far', x: 30_000, y: 0, priority: 5 },
    ],
    localRadius: 11_000,
  });
  assert.deepEqual(feed.map(m => m.id), ['near']);
});

test('remote high-command mission can arrive through a radio-covered front', () => {
  const feed = localMissionFeed({
    playerPosition: { x: 0, y: 0 },
    radioHexIds: ['HX-9'],
    missions: [{ id: 'radio', x: 30_000, y: 0, priority: 4, scope: 'command', hexId: 'HX-9' }],
  });
  assert.equal(feed[0]?.id, 'radio');
});

test('mission range respects the physical range of the weapon', () => {
  assert.equal(missionInWeaponRange({ x: 8_000, y: 0 }, { x: 0, y: 0 }, 9_000), true);
  assert.equal(missionInWeaponRange({ x: 10_000, y: 0 }, { x: 0, y: 0 }, 9_000), false);
});
