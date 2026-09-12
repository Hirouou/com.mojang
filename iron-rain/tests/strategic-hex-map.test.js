import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrategicHexMap, hexControl, canCaptureHex, setSectorOwner, deploymentAllowed } from '../modules/strategic-hex-map.js';

test('the theatre is divided into multi-sector strategic hexes', () => {
  const map = createStrategicHexMap();
  assert.ok(map.length > 12);
  assert.ok(map.every(hex => hex.sectors.length === 7));
  assert.ok(map.some(hex => hexControl(hex) === 'ally'));
  assert.ok(map.some(hex => hexControl(hex) === 'enemy'));
});

test('a strategic hex only flips when every internal sector belongs to the same faction', () => {
  const [seed] = createStrategicHexMap({ width: 20_000, height: 20_000, radius: 4_000 });
  let hex = seed;
  for (const sector of seed.sectors) hex = setSectorOwner(hex, sector.id, 'ally');
  assert.equal(canCaptureHex(hex, 'ally'), true);
  hex = setSectorOwner(hex, hex.sectors[0].id, 'contested');
  assert.equal(canCaptureHex(hex, 'ally'), false);
  assert.equal(hexControl(hex), 'contested');
});

test('regular forces do not magically spawn deep behind enemy lines, but partisans may infiltrate', () => {
  const map = createStrategicHexMap();
  const enemyDeep = map.find(hex => hexControl(hex) === 'enemy' && !map.some(other => hexControl(other) === 'ally' && Math.abs(other.q - hex.q) <= 1 && Math.abs(other.r - hex.r) <= 1));
  assert.ok(enemyDeep);
  assert.equal(deploymentAllowed({ team: 'ally', role: 'regular', destinationHex: enemyDeep, allHexes: map }), false);
  assert.equal(deploymentAllowed({ team: 'ally', role: 'partisan', destinationHex: enemyDeep, allHexes: map }), true);
});
