import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/maintenance-overlay.js', import.meta.url), 'utf8');

test('maintenance overlay keeps feedback visible without looping motion when reduced motion is requested', () => {
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(source, /\.ir-maintenance\.extinguish:before,\.ir-maintenance\.repair:before,\.ir-maintenance\.repair:after\{animation:none\}/);
  assert.match(source, /\.ir-maintenance\.extinguish:before\{transform:translate\(3px,-2px\);opacity:\.68\}/);
});

test('mobile landscape keeps maintenance cues visible without continuous compositing effects', () => {
  assert.match(source, /@media\(max-width:900px\) and \(orientation:landscape\)/);
  assert.match(source, /background:#091009f2;backdrop-filter:none/);
  assert.match(source, /contain:layout paint/);
  assert.match(source, /\.ir-maintenance\.extinguish:before,\.ir-maintenance\.repair:before,\.ir-maintenance\.repair:after\{animation:none\}/);
  assert.match(source, /\.ir-maintenance\.extinguish:before\{transform:translate\(3px,-2px\);opacity:\.72\}/);
  assert.match(source, /\.ir-maintenance\.repair:before,\.ir-maintenance\.repair:after\{transform:translate\(4px,-4px\);opacity:\.85\}/);
});
