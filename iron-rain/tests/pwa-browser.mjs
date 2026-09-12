import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.IRON_RAIN_PLAYWRIGHT || 'C:/Users/Alan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = new URL('../test-results/pwa-browser-results.json', import.meta.url);
const results = { engine: 'Chromium', checkedAt: new Date().toISOString(), tests: [], passed: false };

// An independent ephemeral server exercises the actual GitHub Pages subdirectory.
function prefixServer() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith('/iron-rain/')) { response.writeHead(404); response.end(); return; }
      const relative = decodeURIComponent(url.pathname.slice('/iron-rain/'.length)) || 'index.html';
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}

async function booted(page) {
  await page.waitForFunction(() => {
    const coordinate = document.getElementById('ownCoord');
    const canvas = document.getElementById('game');
    return coordinate && /^X\d+ Y\d+$/.test(coordinate.textContent) && canvas?.width > 0 && canvas?.height > 0;
  });
}

async function checkDeployment(browser, base, name) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  const httpErrors = [];
  const servedByWorker = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('response', response => {
    if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
    if (response.fromServiceWorker()) servedByWorker.push(response.url());
  });
  try {
    await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
    await booted(page);
    assert.equal(await page.evaluate(() => typeof window.ironRainTest), 'undefined', 'Normal boot must not expose diagnostics');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 20000 });
    const installed = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      const files = [];
      for (const name of cacheNames) for (const request of await (await caches.open(name)).keys()) files.push(request.url);
      return { scope: registration.scope, scriptURL: registration.active.scriptURL, cacheNames, files };
    });
    assert.equal(installed.scope, base);
    assert.equal(installed.scriptURL, base + 'sw.js');
    assert.equal(installed.files.length, 13, 'Every offline shell asset is installed');
    assert.ok(installed.files.every(url => url.startsWith(base) && !new URL(url).search));
    assert.equal(errors.length, 0, 'Online boot has no JavaScript errors');
    assert.equal(httpErrors.length, 0, 'Online boot and service worker install have no HTTP asset errors');

    await context.setOffline(true);
    const beforeOffline = servedByWorker.length;
    await page.reload({ waitUntil: 'networkidle' });
    await booted(page);
    const offlineResources = servedByWorker.slice(beforeOffline);
    assert.ok(offlineResources.includes(base + 'index.html'), 'Offline HTML comes from the service worker');
    for (const resource of ['game-v6.js', 'modules/ballistics.js', 'modules/table-map.js', 'modules/war-simulation.js']) {
      assert.ok(offlineResources.includes(base + resource), `${resource} loads offline through the service worker`);
    }
    await page.locator('#deployBtn').click();
    assert.equal(await page.locator('#fireDeck').isVisible(), true, 'Offline reload boots a playable artillery UI');
    assert.match(await page.locator('#rangeReadout').innerText(), /m[\s\S]*m/);
    assert.equal(errors.length, 0, 'Offline boot has no JavaScript errors');
    assert.equal(httpErrors.length, 0, 'No runtime asset returned an HTTP error');

    await context.setOffline(false);
    await page.goto(base + 'index.html?test=1', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.ironRainTest);
    const diagnosticCached = await page.evaluate(async () => {
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) {
        if (new URL(request.url).search) return true;
      }
      return false;
    });
    assert.equal(diagnosticCached, false, 'Diagnostic navigation must never be persisted offline');
    results.tests.push({ name, passed: true, base, registration: installed, offlineReload: true, playableOffline: true, diagnosticCached, offlineResources, httpErrors, javascriptErrors: errors });
  } catch (error) {
    error.details = { url: page.url(), title: await page.title().catch(() => ''), body: await page.locator('body').innerText().catch(() => ''), consoleErrors: errors, httpErrors };
    throw error;
  } finally { await context.close(); }
}

let browser;
let server;
try {
  await access(path.join(root, 'modules/table-map.js'));
  browser = await playwright.chromium.launch({ headless: true });
  const direct = (process.env.IRON_RAIN_URL || 'http://localhost:4173').replace(/\/$/, '') + '/';
  await checkDeployment(browser, direct, 'local root installation');
  server = prefixServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await checkDeployment(browser, `http://127.0.0.1:${server.address().port}/iron-rain/`, 'GitHub Pages /iron-rain/ installation');
  results.passed = true;
} catch (error) {
  results.error = (error.stack || String(error)) + (error.details ? `\nDETAILS ${JSON.stringify(error.details)}` : '');
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(output, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
