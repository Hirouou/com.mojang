import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

test('live cabin consumes the canonical articulated loader rig', () => {
  assert.match(source, /import \{ loaderRigState \} from '\.\/loader-arm\.js';/);
  assert.match(source, /const loaderVisual = createLoaderArmVisual\(scene\);/);
  assert.match(source, /current = loaderRigState\(cycle\);/);
  assert.match(source, /root\.rotation\.y = joints\.baseYaw;/);
  assert.match(source, /shoulder\.rotation\.x = joints\.shoulder;/);
  assert.match(source, /elbow\.rotation\.x = -joints\.elbow \* \.72;/);
  assert.match(source, /const reach = \.56 \+ joints\.extension \* \.72;/);
  assert.match(source, /rammer\.position\.z = -\.13 \+ joints\.rammer \* \.28;/);
});

test('live cabin suppresses the legacy floating transfer round', () => {
  const visualUpdate = source.indexOf('loaderVisual.update(merged.loading);');
  const suppressLegacy = source.indexOf('if (liveLoading) merged.loading = null;');
  const coreUpdate = source.indexOf('core.update(dt, merged);');
  assert.ok(visualUpdate >= 0, 'articulated loader must consume the live loading clock');
  assert.ok(suppressLegacy > visualUpdate, 'legacy loading presentation is suppressed only after the articulated rig samples it');
  assert.ok(coreUpdate > suppressLegacy, 'core renderer must receive loading=null while articulated loader owns presentation');
  assert.match(source, /loader: loaderVisual\.snapshot\(\)/);
});
