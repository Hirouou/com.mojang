import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../mobile-viewport-hotfix.css', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../bootstrap.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('mobile AIM anchors both dial containers without Safari display-contents positioning', () => {
  assert.match(css, /\.handwheel-box\.elevation-box\{[\s\S]*position:absolute!important/);
  assert.match(css, /\.handwheel-box:not\(\.elevation-box\)\{[\s\S]*left:var\(--aim-side\)!important/);
  assert.match(css, /\.handwheel-box\.elevation-box\{[\s\S]*right:var\(--aim-right\)!important/);
  assert.match(css, /#azWheel,[\s\S]*#elWheel[\s\S]*position:absolute!important/);
  assert.doesNotMatch(css, /display:contents!important/);
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
  assert.match(bootstrap, /EXPECTED_CACHE_SUFFIX = 'v7\.28'/);
  assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}v7\.28`/);
  assert.match(sw, /\.\/mobile-viewport-hotfix\.css/);
});
