import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballistics } from '../modules/ballistics.js';
import { artilleryChargeTableRows } from '../modules/artillery-charge-table-view.js';

const tableMapSource = readFileSync(new URL('../modules/table-map.js', import.meta.url), 'utf8');

test('table map charge page consumes the shared charge-table presentation model', () => {
  assert.match(tableMapSource, /import \{ artilleryChargeTableRows \} from '\.\/artillery-charge-table-view\.js';/);
  assert.match(tableMapSource, /artilleryChargeTableRows\(plot\.distance, snapshot\.charge, snapshot\.elev\)/);
  assert.doesNotMatch(tableMapSource, /artilleryNotebookTableRows\(/);
  assert.doesNotMatch(tableMapSource, /notebookSolutions\(/);
  assert.doesNotMatch(tableMapSource, /elevationsForRange\(/);
});

test('charge page renders canonical display labels including manual crank cues', () => {
  assert.match(tableMapSource, /arc\.displayLabel/);
  assert.doesNotMatch(tableMapSource, /arc\.kind === 'low' \? 'BAIXO'/);

  const range = ballistics(5, 30).range;
  const rows = artilleryChargeTableRows(range, 5, 30);
  const current = rows.find(entry => entry.charge === 5);
  assert.ok(current);
  assert.ok(current.arcs.length > 0);
  assert.ok(current.arcs.every(arc => arc.displayLabel.includes('MANIVELA')));

  for (const row of rows.filter(entry => entry.charge !== 5)) {
    assert.ok(row.arcs.every(arc => !arc.displayLabel.includes('MANIVELA')));
  }
});

test('charge page remains informational and does not apply notebook solutions to the gun', () => {
  assert.match(tableMapSource, /Caderneta somente informativa/);
  assert.doesNotMatch(tableMapSource, /snapshot\.charge\s*=/);
  assert.doesNotMatch(tableMapSource, /snapshot\.elev\s*=/);
});
