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

test('maintenance overlay identifies replicated work without calling it local', () => {
  assert.match(source, /source\.textContent = detail\.remote \? 'OUTRO TRIPULANTE' : 'MANUTENÇÃO LOCAL'/);
});
