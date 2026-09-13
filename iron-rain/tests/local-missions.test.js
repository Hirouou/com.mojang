import test from 'node:test';
import assert from 'node:assert/strict';
import { localMissionFeed, localConvoyMaterializationFeed, missionInWeaponRange } from '../modules/local-missions.js';

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

test('nearby convoy materialization uses canonical position without leaking unobserved enemy traffic', () => {
  const feed = localConvoyMaterializationFeed({
    playerPosition: { x: 1_000, y: 1_000 },
    playerTeam: 'ally',
    localRadius: 4_500,
    observedEnemyIds: ['enemy-seen'],
    convoys: [
      { id: 'friendly', team: 'ally', status: 'moving', position: { x: 1_500, y: 1_000, heading: 0.25 } },
      { id: 'enemy-hidden', team: 'enemy', status: 'moving', position: { x: 1_700, y: 1_000, heading: 1 } },
      { id: 'enemy-seen', team: 'enemy', status: 'blocked', position: { x: 2_100, y: 1_000, heading: 2 } },
      { id: 'friendly-far', team: 'ally', status: 'moving', position: { x: 8_000, y: 1_000 } },
      { id: 'friendly-done', team: 'ally', status: 'delivered', position: { x: 1_200, y: 1_000 } },
    ],
  });

  assert.deepEqual(feed.map(convoy => convoy.id), ['friendly', 'enemy-seen']);
  assert.equal(feed[0].position.heading, 0.25);
  assert.equal(feed[0].distance, 500);
  assert.equal(feed.some(convoy => convoy.id === 'enemy-hidden'), false);
});

test('convoy materialization fails closed without a valid player team or position', () => {
  const convoy = { id: 'enemy', team: 'enemy', status: 'moving', position: { x: 0, y: 0 } };
  assert.deepEqual(localConvoyMaterializationFeed({ playerPosition: null, convoys: [convoy], observedEnemyIds: ['enemy'] }), []);
  assert.deepEqual(localConvoyMaterializationFeed({ playerPosition: { x: 0, y: 0 }, playerTeam: 'neutral', convoys: [convoy], observedEnemyIds: ['enemy'] }), []);
});

test('mission range respects the physical range of the weapon', () => {
  assert.equal(missionInWeaponRange({ x: 8_000, y: 0 }, { x: 0, y: 0 }, 9_000), true);
  assert.equal(missionInWeaponRange({ x: 10_000, y: 0 }, { x: 0, y: 0 }, 9_000), false);
});