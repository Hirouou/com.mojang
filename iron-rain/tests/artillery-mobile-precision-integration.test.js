import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('mobile AIM exposes dual canonical touch dials with metre-precise range telemetry', async () => {
  const [css, viewportCss, game] = await Promise.all([
    read('mobile-station-ui.css'),
    read('mobile-viewport-hotfix.css'),
    read('game-v6.js'),
  ]);
  const liveCss = `${css}\n${viewportCss}`;
  assert.match(viewportCss, /handwheel-box:not\(\.elevation-box\)/);
  assert.match(viewportCss, /handwheel-box\.elevation-box/);
  assert.match(viewportCss, /#azWheel,[\s\S]*#elWheel/);
  assert.match(viewportCss, /position:absolute!important/);
  assert.match(liveCss, /#rangeReadout/);
  assert.match(liveCss, /DISTÂNCIA \/ SOLUÇÃO/);
  assert.match(liveCss, /\.charge-box/);
  // The mobile readout exposes the canonical ballistic result in metres so a
  // one-decimal kilometre display can never hide meaningful aiming differences.
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
