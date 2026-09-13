import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/maintenance-overlay.js', import.meta.url), 'utf8');
const cabinSource = await readFile(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('maintenance overlay listens on the live cabin maintenance event seam', () => {
  assert.match(source, /const EVENT_NAME = 'ironrain:maintenance-feedback'/);
  assert.match(cabinSource, /new CustomEvent\('ironrain:maintenance-feedback'/);
  assert.doesNotMatch(source, /const EVENT_NAME = 'iron-rain:maintenance-feedback'/);
});

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

test('coarse pointers keep the compact maintenance readout but quiesce screen-space vfx', () => {
  assert.ok(source.includes('function coarseMaintenanceVfx()'));
  assert.ok(source.includes("globalThis.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true"));
  assert.ok(source.includes('const vfxActive = localVfx && !coarseMaintenanceVfx() &&'));
  assert.ok(source.includes('@media(max-width:900px) and (orientation:landscape)'));
  assert.ok(source.includes('.ir-maintenance-vfx{display:none!important}'));
  assert.ok(source.includes('.ir-maintenance{top:61%;min-width:154px'));
});

test('maintenance overlay identifies replicated work without calling it local', () => {
  assert.match(source, /setText\(source, detail\.remote \? 'OUTRO TRIPULANTE' : 'MANUTENÇÃO LOCAL'\)/);
  assert.match(source, /classList\.toggle\('remote', detail\.remote === true\)/);
  assert.match(source, /\.ir-maintenance\.remote\{border-left-color:#7fa7c8/);
});

test('replicated maintenance keeps status feedback without impersonating the local tool', () => {
  assert.ok(source.includes('const localVfx = detail.remote !== true'));
  assert.ok(source.includes('const vfxActive = localVfx && !coarseMaintenanceVfx() && (isExtinguish ? spray > .02 : repairMotion > .02 || sparks > .02)'));
  assert.doesNotMatch(source, /\.ir-maintenance-vfx\.remote\{/);
  assert.doesNotMatch(source, /detail\.remote === true \? ' remote' : ''/);
});

test('maintenance overlay fails closed for unknown maintenance kinds', () => {
  assert.match(source, /const isRepair = detail\.kind === 'repair'/);
  assert.match(source, /if \(!isExtinguish && !isRepair\) \{\s*hideMaintenance\(element\);\s*return;/);
  assert.match(source, /function hideMaintenance\(element\) \{[\s\S]*element\.hidden = true;[\s\S]*vfx\.className = 'ir-maintenance-vfx'/);
});

test('maintenance overlay avoids redundant per-frame DOM and style writes', () => {
  assert.match(source, /function setStyleProperty\(element, name, next\)/);
  assert.match(source, /element\.style\.getPropertyValue\(name\) === next/);
  assert.match(source, /function setText\(element, next\)/);
  assert.match(source, /element\.textContent !== next/);
  assert.match(source, /Math\.round\(progress \* 100\) \/ 100/);
  assert.match(source, /Math\.round\(spray \* 100\) \/ 100/);
  assert.match(source, /if \(vfx\.className !== nextClass\) vfx\.className = nextClass/);
});

test('maintenance overlay quiesces active css vfx when the page backgrounds', () => {
  assert.match(source, /function hideForPageLifecycle\(\) \{\s*hideMaintenance\(root\);\s*\}/);
  assert.match(source, /globalThis\.addEventListener\('pagehide', hideForPageLifecycle\)/);
  assert.match(source, /visibilityState === 'hidden'\) hideForPageLifecycle\(\)/);
  assert.match(source, /document\?\.addEventListener\?\.\('visibilitychange', onVisibilityChange\)/);
});
