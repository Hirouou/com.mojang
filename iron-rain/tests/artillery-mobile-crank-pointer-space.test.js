import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../modules/cabin-view-core.js', import.meta.url), 'utf8');

test('physical artillery cranks normalize viewport pointers into canvas space', () => {
  assert.match(source, /function canvasPoint\(clientX, clientY\)/);
  assert.match(source, /canvas\.getBoundingClientRect\?\.\(\)/);
  assert.match(source, /clientX-\(Number\(rect\?\.left\)\|\|0\)/);
  assert.match(source, /clientY-\(Number\(rect\?\.top\)\|\|0\)/);
  assert.match(source, /\*width\/rectWidth/);
  assert.match(source, /\*height\/rectHeight/);
});

test('crank acquisition and drag angles both use normalized canvas coordinates', () => {
  const wheelAt = source.slice(source.indexOf('function wheelAt'), source.indexOf("listen(canvas,'pointerdown'"));
  assert.match(wheelAt, /point=canvasPoint\(clientX,clientY\)/);
  assert.match(wheelAt, /point\.x >= b\.x/);
  assert.match(wheelAt, /point\.y >= b\.y/);
  assert.doesNotMatch(wheelAt, /clientX >= b\.x|clientY >= b\.y/);

  const pointerMove = source.slice(source.indexOf("listen(canvas,'pointermove'"), source.indexOf("listen(document,'mousemove'"));
  assert.match(pointerMove, /point=canvasPoint\(e\.clientX,e\.clientY\)/);
  assert.match(pointerMove, /Math\.atan2\(point\.y - cy, point\.x - cx\)/);
  assert.doesNotMatch(pointerMove, /Math\.atan2\(e\.clientY - cy, e\.clientX - cx\)/);
});
