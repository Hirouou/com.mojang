import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const cabin = readFileSync(new URL('../modules/cabin-view.js', import.meta.url), 'utf8');

function importedRelativeModules(source) {
  return [...source.matchAll(/from\s+['"](\.\/[^'"]+\.js)['"]/g)].map(match => match[1]);
}

test('offline PWA caches every direct cabin-view module dependency', () => {
  const imports = importedRelativeModules(cabin);
  assert.ok(imports.includes('./cabin-view-core.js'));
  assert.ok(imports.includes('./remote-hull-impact-feedback.js'));

  for (const relativePath of imports) {
    const cachedPath = `'./modules/${relativePath.slice(2)}'`;
    assert.ok(sw.includes(cachedPath), `sw.js must cache ${cachedPath}`);
  }
});

test('service worker cache revision is v7.20 or newer after cabin dependency fix', () => {
  const match = sw.match(/CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}v7\.(\d+)`/);
  assert.ok(match, 'service worker cache version should be explicit');
  assert.ok(Number(match[1]) >= 20, 'cache version must invalidate older incomplete offline shell');
});
