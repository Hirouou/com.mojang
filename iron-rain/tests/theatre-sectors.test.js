import test from 'node:test';
import assert from 'node:assert/strict';
import { createTheatreSectorSeeds } from '../modules/theatre-sectors.js';
import { controlLineX } from '../modules/theatre-control.js';

test('front sectors are ordered along the same territorial boundary', () => {
  const sectors = createTheatreSectorSeeds();
  for (let i = 0; i < sectors.length; i++) {
    assert.equal(sectors[i].x, controlLineX(sectors[i].y));
    if (i) assert.ok(sectors[i].y > sectors[i - 1].y);
    assert.ok(sectors[i].assetTerritory.every(team => team === 'enemy'));
  }
});
