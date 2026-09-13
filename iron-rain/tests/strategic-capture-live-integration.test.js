import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const liveSource = await readFile(new URL('../modules/strategic-war-live-v3.js', import.meta.url), 'utf8');
const facadeSource = await readFile(new URL('../modules/strategic-war-live.js', import.meta.url), 'utf8');

test('live strategic renderer consumes authoritative sector-control projection', () => {
  assert.match(liveSource, /import \{ applyAuthoritativeSectorControl \} from '\.\/strategic-capture-state\.js';/);
  assert.match(liveSource, /function applySectorControl\(\{ sectorId, owner, contested = false, revision \} = \{\}\)/);
  assert.match(liveSource, /record = theatre\.records\.get\(id\)/);
  assert.match(liveSource, /territoryNode = theatre\.territory\.get\(id\)/);
  assert.match(liveSource, /logistics: theatre\.logistics/);
  assert.match(liveSource, /applyAuthoritativeSectorControl\(\{/);
  assert.match(liveSource, /owner,\s*contested,\s*revision,/s);
  assert.match(liveSource, /window\.ironRainStrategicMap = Object\.freeze\(\{ locate, combatReserveContext, applySectorControl,/);
});

test('authoritative sector updates immediately feed panels and the same live front', () => {
  assert.match(liveSource, /if \(result\.ok && result\.changed\) \{\s*updatePanels\(\);\s*if \(open\) draw\(\);\s*\}/s);
  assert.match(liveSource, /strategicFrontPath\(\{\s*sectors: \[\.\.\.theatre\.records\.values\(\)\]\.map\(\(\{ sector \}\) => sector\)/s);
});

test('canonical strategic facade keeps the authoritative sector-control seam', () => {
  assert.match(facadeSource, /const applySectorControl = globalThis\.ironRainStrategicMap\?\.applySectorControl;/);
  assert.match(facadeSource, /applySectorControl: update => applySectorControl\?\.\(update\)/);
  assert.doesNotMatch(facadeSource, /createStrategicHexMap|strategicFrontPath|createStrategicLogistics/);
});
