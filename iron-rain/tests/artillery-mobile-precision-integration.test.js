import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('mobile AIM exposes both touch dials while the shared solution remains metre-precise', async () => {
  const [css, game] = await Promise.all([read('mobile-viewport-hotfix.css'), read('game-v6.js')]);
  assert.match(css, /#fireDeck\[data-station="aim"\] \.handwheel-box\{\s*display:contents!important/);
  assert.match(css, /#fireDeck\[data-station="aim"\] #rangeReadout\{\s*display:flex!important/);
  assert.match(css, /\.charge-box/);
  assert.match(game, /UI\.range\.(?:textContent|innerHTML)\s*=.*Math\.round\((?:solution|B)\.range\)\.toLocaleString\('pt-BR'\).* m/);
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
