import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../mobile-viewport-hotfix.css', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../bootstrap.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('hidden AIM deck wins over mobile display override while menus are open', () => {
  const game = readFileSync(new URL('../game-v6.js', import.meta.url), 'utf8');
  assert.match(game, /UI\.fireDeck\.classList\.toggle\('hidden',busy\|\|!!sheetOpen/);
  assert.match(css, /\.inside\.station-engaged \.fire-deck\[data-station="aim"\]\.hidden\s*\{\s*display:none!important;\s*\}/);
});

test('mobile AIM places thumb dials beside charge/fire and keeps the range below', () => {
  assert.match(css, /#fireDeck\[data-station="aim"\] \.handwheel-box\{\s*display:contents!important/);
  assert.match(css, /#elWheel\{grid-column:3!important/);
  assert.match(css, /#rangeReadout\{\s*display:flex!important;grid-column:1 \/ -1!important;grid-row:3!important/);
  assert.match(css, /#fireDeck\[data-station="aim"\] \.charge-box\{[\s\S]*position:static!important/);
  assert.match(css, /#fireDeck\[data-station="aim"\] #fireBtn\{[\s\S]*min-height:46px!important/);
  assert.match(css, /--aim-dial-size/);
});
test('visible viewport is shared by app, lobby and renderer resize flow', () => {
  assert.match(css, /#app\{[\s\S]*width:var\(--ir-viewport-w\)!important/);
  assert.match(css, /html body \.crew-lobby\{[\s\S]*height:var\(--ir-viewport-h\)!important/);
  assert.match(bootstrap, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(bootstrap, /--ir-viewport-w/);
  assert.match(bootstrap, /window\.dispatchEvent\(new Event\('resize'\)\)/);
});

test('PWA cache contract carries the viewport hotfix', () => {
  assert.match(bootstrap, /mobile-viewport-hotfix\.css/);
  assert.match(sw, /\.\/mobile-viewport-hotfix\.css/);

  const bootstrapCache = bootstrap.match(/EXPECTED_CACHE_SUFFIX = '(v\d+\.\d+)'/);
  const workerCache = sw.match(/CACHE_NAME = `\$\{CACHE_PREFIX\}(v\d+\.\d+)`/);
  assert.ok(bootstrapCache?.[1], 'bootstrap must declare the expected PWA cache revision');
  assert.ok(workerCache?.[1], 'service worker must declare the active PWA cache revision');
  assert.equal(workerCache[1], bootstrapCache[1], 'bootstrap and service worker cache revisions must stay aligned');
});
