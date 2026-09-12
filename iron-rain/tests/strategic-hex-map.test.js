import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrategicHexMap, hexControl, canCaptureHex, setSectorOwner, deploymentAllowed, sectorCaptureAllowed, captureSectorWithFront } from '../modules/strategic-hex-map.js';
import { DEFAULT_CONTROL_LINE } from '../modules/theatre-control.js';

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

test('sector capture advances through adjacent sectors instead of creating isolated pockets', () => {
  const sectors = Array.from({ length: 7 }, (_, index) => ({ id: `HX-A-S${index}`, owner: 'neutral' }));
  const hex = { id: 'HX-A', q: 0, r: 0, sectors };

  assert.equal(sectorCaptureAllowed({ team: 'ally', hex, sectorId: 'HX-A-S0', allHexes: [] }), false);

  sectors[1].owner = 'ally';
  assert.equal(sectorCaptureAllowed({ team: 'ally', hex, sectorId: 'HX-A-S0', allHexes: [] }), true);

  sectors[1].owner = 'neutral';
  sectors[5].owner = 'ally';
  assert.equal(sectorCaptureAllowed({ team: 'ally', hex, sectorId: 'HX-A-S3', allHexes: [] }), false);

  sectors[0].owner = 'ally';
  assert.equal(sectorCaptureAllowed({ team: 'ally', hex, sectorId: 'HX-A-S3', allHexes: [] }), true);
});

test('a border sector can only be entered from its matching fully controlled neighboring hex', () => {
  const sectors = Array.from({ length: 7 }, (_, index) => ({ id: `HX-A-S${index}`, owner: 'neutral' }));
  const hex = { id: 'HX-A', q: 0, r: 0, sectors };
  const friendlySectors = Array.from({ length: 7 }, (_, index) => ({ id: `HX-B-S${index}`, owner: 'ally' }));
  const matchingNeighbor = { id: 'HX-B', q: 1, r: 0, sectors: friendlySectors };
  const wrongNeighbor = { id: 'HX-C', q: 0, r: -1, sectors: friendlySectors };

  assert.equal(sectorCaptureAllowed({ team: 'ally', hex, sectorId: 'HX-A-S3', allHexes: [wrongNeighbor] }), false);
  assert.equal(sectorCaptureAllowed({ team: 'ally', hex, sectorId: 'HX-A-S3', allHexes: [matchingNeighbor] }), true);

  matchingNeighbor.sectors[0].owner = 'contested';
  assert.equal(sectorCaptureAllowed({ team: 'ally', hex, sectorId: 'HX-A-S3', allHexes: [matchingNeighbor] }), false);
});

test('connected capture changes ownership and bends the same canonical front snapshot', () => {
  const sectors = Array.from({ length: 7 }, (_, index) => ({
    id: `HX-A-S${index}`,
    owner: index === 0 ? 'ally' : 'neutral',
    y: 24_000 + index * 100,
    structures: [],
  }));
  const hex = { id: 'HX-A', q: 0, r: 0, sectors };
  const result = captureSectorWithFront({
    team: 'ally',
    hex,
    sectorId: 'HX-A-S3',
    allHexes: [hex],
    points: DEFAULT_CONTROL_LINE,
    pushMetres: 2_000,
    radius: 5_000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.hex.sectors[3].owner, 'ally');
  assert.ok(result.line.some((point, index) => point.x > DEFAULT_CONTROL_LINE[index].x));
  assert.deepEqual(DEFAULT_CONTROL_LINE.map(point => ({ ...point })), [
    { y: 0, x: 39_000 },
    { y: 8_000, x: 41_200 },
    { y: 16_000, x: 38_600 },
    { y: 24_000, x: 42_000 },
    { y: 32_000, x: 39_400 },
    { y: 40_000, x: 42_600 },
    { y: 48_000, x: 39_800 },
    { y: 60_000, x: 41_000 },
  ]);
});

test('disconnected capture fails closed without moving ownership or front', () => {
  const sectors = Array.from({ length: 7 }, (_, index) => ({
    id: `HX-A-S${index}`,
    owner: index === 5 ? 'ally' : 'neutral',
    y: 30_000 + index * 100,
    structures: [],
  }));
  const hex = { id: 'HX-A', q: 0, r: 0, sectors };
  const result = captureSectorWithFront({ team: 'ally', hex, sectorId: 'HX-A-S3', points: DEFAULT_CONTROL_LINE });

  assert.equal(result.ok, false);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'disconnected');
  assert.equal(result.hex.sectors[3].owner, 'neutral');
  assert.deepEqual(result.line, DEFAULT_CONTROL_LINE);
});

test('enemy capture bends the canonical front west with the same magnitude rule', () => {
  const sectors = Array.from({ length: 7 }, (_, index) => ({
    id: `HX-E-S${index}`,
    owner: index === 0 ? 'enemy' : 'neutral',
    y: 24_000 + index * 100,
    structures: [],
  }));
  const hex = { id: 'HX-E', q: 0, r: 0, sectors };
  const result = captureSectorWithFront({
    team: 'enemy',
    hex,
    sectorId: 'HX-E-S3',
    allHexes: [hex],
    points: DEFAULT_CONTROL_LINE,
    pushMetres: 2_000,
    radius: 5_000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.hex.sectors[3].owner, 'enemy');
  assert.ok(result.line.some((point, index) => point.x < DEFAULT_CONTROL_LINE[index].x));
});

test('already-owned sector preserves ownership and front snapshot exactly', () => {
  const sectors = Array.from({ length: 7 }, (_, index) => ({
    id: `HX-A-S${index}`,
    owner: 'ally',
    y: 24_000 + index * 100,
    structures: [],
  }));
  const hex = { id: 'HX-A', q: 0, r: 0, sectors };
  const result = captureSectorWithFront({
    team: 'ally',
    hex,
    sectorId: 'HX-A-S3',
    allHexes: [hex],
    points: DEFAULT_CONTROL_LINE,
    pushMetres: 2_000,
    radius: 5_000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'already-owned');
  assert.equal(result.hex, hex);
  assert.deepEqual(result.line, DEFAULT_CONTROL_LINE);
});
