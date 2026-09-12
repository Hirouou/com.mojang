import assert from 'node:assert/strict';
import { createHexRegionSectors, createTheatreHexRegions, regionControlFromSectors } from '../modules/theatre-regions.js';

const straightLine = Object.freeze([
  Object.freeze({ x: 40_000, y: 0 }),
  Object.freeze({ x: 40_000, y: 60_000 }),
]);

assert.equal(regionControlFromSectors([{ control: 'ally' }, { control: 'ally' }]), 'ally');
assert.equal(regionControlFromSectors([{ control: 'enemy' }, { control: 'enemy' }]), 'enemy');
assert.equal(regionControlFromSectors([{ control: 'ally' }, { control: 'enemy' }]), 'contested');

const mixed = createHexRegionSectors({ id: 'front', x: 40_000, y: 30_000, radius: 6_000, points: straightLine, contestedWidth: 900 });
assert.equal(mixed.length, 7);
assert.equal(regionControlFromSectors(mixed), 'contested');
assert.ok(mixed.some(sector => sector.control === 'ally'));
assert.ok(mixed.some(sector => sector.control === 'enemy'));

const ally = createHexRegionSectors({ id: 'rear-a', x: 20_000, y: 30_000, radius: 6_000, points: straightLine, contestedWidth: 900 });
const enemy = createHexRegionSectors({ id: 'rear-e', x: 60_000, y: 30_000, radius: 6_000, points: straightLine, contestedWidth: 900 });
assert.equal(regionControlFromSectors(ally), 'ally');
assert.equal(regionControlFromSectors(enemy), 'enemy');

const regions = createTheatreHexRegions({ columns: 6, rows: 5, radius: 6_000, points: straightLine, contestedWidth: 900 });
assert.ok(regions.length > 0);
assert.ok(Object.isFrozen(regions));
for (const region of regions) {
  assert.equal(region.sectors.length, 7);
  assert.ok(Object.isFrozen(region));
  assert.ok(Object.isFrozen(region.sectors));
  const expected = region.sectors.every(sector => sector.control === 'ally') ? 'ally'
    : region.sectors.every(sector => sector.control === 'enemy') ? 'enemy'
      : 'contested';
  assert.equal(region.control, expected);
}

console.log('theatre-regions: ok');
