import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('mobile AIM keeps HUD wheels hidden and leaves only compact charge/fire controls at the right', async () => {
  const [viewportCss, cabinCore, game] = await Promise.all([
    read('mobile-viewport-hotfix.css'),
    read('modules/cabin-view-core.js'),
    read('game-v6.js'),
  ]);

  // Coarse-pointer AIM must not recreate a second pair of DOM handwheels.
  assert.match(viewportCss, /fire-deck\[data-station="aim"\][\s\S]*\.handwheel-box[\s\S]*display:none!important/);
  assert.doesNotMatch(viewportCss, /#azWheel,[\s\S]*#elWheel[\s\S]*pointer-events:auto!important/);

  // The canonical touch manipulation remains on the physical 3D cabin wheels.
  assert.match(cabinCore, /function wheelAt\(clientX, clientY\)/);
  assert.match(cabinCore, /if \(station !== 'aim'\) return null/);
  assert.match(cabinCore, /getWheelBounds\(\)/);
  assert.match(cabinCore, /onWheelDelta\(\{ axis: wheelPointer\.axis, degrees: rawDegrees \* reduction \}\)/);

  // Owner mobile layout: CARGA on the right and DISPARAR directly below it,
  // with the viewport centre free for the physical controls.
  assert.match(viewportCss, /\.charge-box\{[\s\S]*right:var\(--aim-right\)!important[\s\S]*bottom:calc\(var\(--aim-bottom\) \+ 54px\)!important/);
  assert.match(viewportCss, /\.fire-actions\{[\s\S]*right:var\(--aim-right\)!important[\s\S]*bottom:var\(--aim-bottom\)!important/);

  // Ballistic truth still resolves in metres in the underlying game state.
  assert.match(game, /UI\.range\.(?:textContent|innerHTML)\s*=.*Math\.round\((?:solution|B)\.range\)\.toLocaleString\('pt-BR'\).* m/);
});

test('physical touch handwheels are geared down while desktop retains the original delta', async () => {
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
