import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../modules/war-audio.js', import.meta.url), 'utf8');

test('remote maintenance reuses the live cadence with quieter local presentation', () => {
  assert.match(source, /const sourceGain = result\.emit\.payload\?\.remote === true \? \.58 : 1;/);
  assert.match(source, /noise\(\.16, \(\.13 \+ progress \* \.04\) \* sourceGain, 5200/);
  assert.match(source, /noise\(\.2, \(\.07 \+ progress \* \.03\) \* sourceGain, 8200/);
  assert.match(source, /tone\(\.07, \(\.07 \+ progress \* \.025\) \* sourceGain, 245/);
  assert.match(source, /noise\(\.08, \(\.08 \+ progress \* \.035\) \* sourceGain, 3100/);
  assert.doesNotMatch(source, /createPanner\(|StereoPannerNode|new AudioContext/, 'remote maintenance must not open a parallel spatial/audio pipeline');
});
