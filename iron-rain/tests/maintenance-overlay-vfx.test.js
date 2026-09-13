import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/maintenance-overlay.js', import.meta.url), 'utf8');

test('maintenance overlay consumes canonical spray, sparks and repair motion signals', () => {
  assert.match(source, /Number\(detail\.spray\)/);
  assert.match(source, /Number\(detail\.sparks\)/);
  assert.match(source, /Number\(detail\.repairMotion\)/);
  assert.match(source, /--spray/);
  assert.match(source, /--sparks/);
  assert.match(source, /--repair/);
});

test('maintenance overlay exposes perceptible foam and repair vfx with safe fallbacks', () => {
  assert.match(source, /vfxActive \? ' active' : ''/);
  assert.match(source, /ir-spray-cone/);
  assert.match(source, /ir-tool-strike/);
  assert.match(source, /prefers-reduced-motion:reduce/);
  assert.match(source, /vfx\.className = 'ir-maintenance-vfx'/);
});

test('mobile landscape keeps local maintenance motion but stops large compositor loops', () => {
  assert.match(source, /@media\(max-width:900px\) and \(orientation:landscape\)/);
  assert.match(source, /\.ir-maintenance-vfx\.extinguish:after,\.ir-maintenance-vfx\.repair:after\{animation:none\}/);
  assert.match(source, /\.ir-maintenance-vfx\.extinguish \.foam\{[^}]*animation-duration:\.26s/);
  assert.match(source, /\.ir-maintenance-vfx\.repair \.tool\{left:72%;top:58%\}/);
  assert.match(source, /\.ir-maintenance-vfx\.repair \.spark\{left:74%;top:61%\}/);
});

test('maintenance overlay identifies replicated work without calling it local', () => {
  assert.match(source, /source\.textContent = detail\.remote \? 'OUTRO TRIPULANTE' : 'MANUTENÇÃO LOCAL'/);
  assert.match(source, /classList\.toggle\('remote', detail\.remote === true\)/);
  assert.match(source, /\.ir-maintenance\.remote\{border-left-color:#7fa7c8/);
});

test('maintenance overlay fails closed for unknown maintenance kinds', () => {
  assert.match(source, /const isRepair = detail\.kind === 'repair'/);
  assert.match(source, /if \(!isExtinguish && !isRepair\) \{[\s\S]*element\.hidden = true;[\s\S]*vfx\.className = 'ir-maintenance-vfx'/);
});
