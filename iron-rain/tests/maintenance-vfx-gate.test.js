import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/maintenance-overlay.js', import.meta.url), 'utf8');

test('maintenance vfx only animates while canonical action feedback is active', () => {
  assert.match(source, /const isExtinguish = detail\.kind === 'extinguish'/);
  assert.match(source, /const vfxActive = isExtinguish \? spray > \.02 : repairMotion > \.02 \|\| sparks > \.02/);
  assert.match(source, /ir-maintenance-vfx\$\{vfxActive \? ' active' : ''\}/);
});

test('maintenance vfx consumes canonical engine danger without adding another clock', () => {
  assert.match(source, /const danger = Math\.max\(0, Math\.min\(1, Number\(detail\.dangerPulse\) \|\| 0\)\)/);
  assert.match(source, /--danger:0/);
  assert.match(source, /var\(--danger\)/);
  assert.match(source, /setProperty\('--danger', String\(danger\)\)/);
  assert.doesNotMatch(source, /setInterval|setTimeout/);
});
