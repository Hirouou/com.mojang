import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('mobile AIM keeps canonical metre range telemetry without restoring duplicate handwheels', async () => {
  const [css, game] = await Promise.all([read('mobile-station-ui.css'), read('game-v6.js')]);
  assert.match(css, /handwheel-box\.elevation-box/);
  assert.match(css, /range-readout/);
  assert.match(css, /handwheel-box\.elevation-box \.handwheel/);
  assert.match(game, /UI\.range\.textContent\s*=\s*`\$\{Math\.round\(solution\.range\)\.toLocaleString\('pt-BR'\)\} m`/);
});

test('touch handwheels are geared down while desktop retains the original delta', async () => {
  const cabin = await read('modules/cabin-view.js');
  assert.match(cabin, /\(hover: none\) and \(pointer: coarse\)/);
  assert.match(cabin, /axis === 'elevation' \? \.055 : \.12/);
  assert.match(cabin, /touchAimReduction = axis => coarseAimPointer/);
  assert.match(cabin, /degrees: degrees \* touchAimReduction\(event\.axis\)/);
});

test('still-air ballistic truth has no random dispersion and wind remains explicit drift', async () => {
  const ballistics = await read('modules/ballistics.js');
  assert.doesNotMatch(ballistics, /Math\.random/);
  assert.match(ballistics, /WIND_ACCELERATION/);
  assert.match(ballistics, /accelerationX/);
  assert.match(ballistics, /accelerationY/);
});
