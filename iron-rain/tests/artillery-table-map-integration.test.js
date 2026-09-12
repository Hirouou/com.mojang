import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballistics } from '../modules/ballistics.js';
import { artilleryNotebookTableRows } from '../modules/artillery-notebook.js';

const tableMapSource = readFileSync(new URL('../modules/table-map.js', import.meta.url), 'utf8');

test('table map charge page stays wired to the shared artillery notebook model', () => {
  assert.match(tableMapSource, /import \{ artilleryNotebookTableRows \} from '\.\/artillery-notebook\.js';/);
  assert.match(tableMapSource, /artilleryNotebookTableRows\(plot\.distance, snapshot\.charge\)/);
  assert.doesNotMatch(tableMapSource, /notebookSolutions\(/);
  assert.doesNotMatch(tableMapSource, /elevationsForRange\(/);
});

test('charge-page arc labels preserve low, high and single branches from shared ballistics', () => {
  assert.match(tableMapSource, /arc\.kind === 'low' \? 'BAIXO' : arc\.kind === 'high' \? 'ALTO' : 'ÚNICO'/);
  assert.match(tableMapSource, /arc\.elevation\.toFixed\(1\)/);
  assert.match(tableMapSource, /number\(arc\.apex\)/);
  assert.match(tableMapSource, /arc\.tof\.toFixed\(1\)/);

  const range = ballistics(5, 30).range;
  const row = artilleryNotebookTableRows(range, 5).find(entry => entry.charge === 5);
  assert.ok(row);
  assert.deepEqual(row.arcs.map(arc => arc.kind), ['low', 'high']);

  const maxRange = ballistics(5, 45).range;
  const maxRow = artilleryNotebookTableRows(maxRange, 5).find(entry => entry.charge === 5);
  assert.ok(maxRow);
  assert.deepEqual(maxRow.arcs.map(arc => arc.kind), ['single']);
});

test('charge page remains informational and does not apply notebook solutions to the gun', () => {
  assert.match(tableMapSource, /Caderneta somente informativa/);
  assert.doesNotMatch(tableMapSource, /snapshot\.charge\s*=/);
  assert.doesNotMatch(tableMapSource, /snapshot\.elev\s*=/);
});
