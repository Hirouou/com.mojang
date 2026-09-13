import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stationCss = await readFile(new URL('../mobile-station-ui.css', import.meta.url), 'utf8');
const viewportCss = await readFile(new URL('../mobile-viewport-hotfix.css', import.meta.url), 'utf8');
const lobbyJs = await readFile(new URL('../modules/crew-lobby-ui.js', import.meta.url), 'utf8');

test('crew lobby hidden state wins over responsive display grid override', () => {
  assert.match(stationCss, /html body \.crew-lobby\s*\{[\s\S]*?display:grid!important;/);
  assert.match(viewportCss, /html body \.crew-lobby\.hidden\s*\{\s*display:none!important;\s*\}/);
});

test('crew lobby hide also forces an inline important display override', () => {
  assert.match(lobbyJs, /hide\(\)\s*\{[\s\S]*?classList\.add\('hidden'\)[\s\S]*?style\.setProperty\('display',\s*'none',\s*'important'\)/);
  assert.match(lobbyJs, /show\(\)\s*\{[\s\S]*?style\.removeProperty\('display'\)[\s\S]*?classList\.remove\('hidden'\)/);
});
