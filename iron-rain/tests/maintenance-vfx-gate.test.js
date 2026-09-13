import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/maintenance-overlay.js', import.meta.url), 'utf8');

test('maintenance vfx only animates while canonical local action feedback is active', () => {
  assert.match(source, /const isExtinguish = detail\.kind === 'extinguish'/);
  assert.match(source, /const localVfx = detail\.remote !== true/);
  assert.ok(source.includes('const vfxActive = localVfx && !coarseMaintenanceVfx() && (isExtinguish ? spray > .02 : repairMotion > .02 || sparks > .02)'));
  assert.match(source, /ir-maintenance-vfx\$\{vfxActive \? ' active' : ''\}/);
});

test('maintenance vfx fails closed on coarse pointers instead of starting screen-space compositor loops', () => {
  assert.ok(source.includes("globalThis.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true"));
  assert.ok(source.includes('.ir-maintenance-vfx{display:none!important}'));
});

test('maintenance vfx consumes canonical engine danger without adding another clock', () => {
  assert.match(source, /const danger = Math\.max\(0, Math\.min\(1, Number\(detail\.dangerPulse\) \|\| 0\)\)/);
  assert.match(source, /--danger:0/);
  assert.match(source, /var\(--danger\)/);
  assert.match(source, /setStyleProperty\(vfx, '--danger', \(Math\.round\(danger \* 100\) \/ 100\)\.toFixed\(2\)\)/);
  assert.doesNotMatch(source, /setInterval|setTimeout/);
});
