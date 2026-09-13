import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

function relativeImports(source) {
  const found = new Set();
  for (const pattern of [
    /(?:from\s+|import\s*)['"](\.\.?\/[^'"]+)['"]/g,
    /import\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

test('PWA offline cache includes transitive runtime module imports', async () => {
  const worker = await readFile(new URL('sw.js', root), 'utf8');
  const listBody = worker.match(/const OFFLINE_FILES = \[([\s\S]*?)\];/)?.[1] || '';
  const offline = new Set([...listBody.matchAll(/['"](\.\/[^'"]+)['"]/g)].map(match => match[1]));

  assert.ok(offline.has('./bootstrap.js'));
  assert.ok(offline.has('./game-v6.js'));

  for (const asset of [...offline].filter(path => path.endsWith('.js') && !path.startsWith('./vendor/'))) {
    const source = await readFile(new URL(asset.slice(2), root), 'utf8');
    for (const relative of relativeImports(source)) {
      const dependency = './' + new URL(relative, new URL(asset.slice(2), root)).pathname.slice(root.pathname.length);
      assert.ok(offline.has(dependency), `${asset} imports ${dependency}, but it is missing from OFFLINE_FILES`);
    }
  }
});
