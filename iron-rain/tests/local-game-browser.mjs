import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startLocalGame } from '../serve.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');
const directory = await mkdtemp(path.join(tmpdir(), 'iron-rain-browser-'));
const dbPath = path.join(directory, 'war.sqlite');
let running;
let browser;
const errors = [];
const requests = [];
await mkdir('test-results', { recursive: true });
try {
  running = await startLocalGame({ port: 0, dbPath });
  const port = running.server.address().port;
  const origin = running.url;
  browser = await chromium.launch({ headless: true,
    ...(process.env.IRON_RAIN_CHROMIUM ? { executablePath: process.env.IRON_RAIN_CHROMIUM } : {}),
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  // Limit software-rendered frames without changing simulation or controls.
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => setTimeout(() => callback(time), 40));
  });
  await page.goto(`${origin}/?test=1`);
  await page.waitForSelector('.server-lobby[data-connected="true"]');
  assert.equal(await page.locator('[data-server-mode]').innerText(), 'CAMPANHA LOCAL');
  await page.locator('[data-server-faction="allies"]').click();
  await page.screenshot({ path: 'test-results/local-lobby-desktop.png' });
  await page.locator('[data-server-create]').click();
  await page.waitForFunction(() => window.ironRainTest?.snapshot().cabin?.renderer.drawCalls > 0);
  const identity = await page.evaluate(() => ironRainEntry.runtime.status().localId);
  const mamute = await page.evaluate(() => ironRainEntry.runtime.status().mamuteId);
  const theatre = await page.evaluate(() => ironRainEntry.runtime.snapshot().theatreId);
  await page.evaluate(() => ironRainTest.setPose({ x: 0, z: 0, yaw: 0, pitch: 0 }));
  await page.locator('#interactBtn').click();
  await page.waitForFunction(() => ironRainTest.snapshot().station === 'aim');
  await page.screenshot({ path: 'test-results/local-cabin-desktop.png' });
  const ammo = await page.evaluate(() => ironRainTest.snapshot().ammo.HE);
  await page.locator('#fireBtn').click();
  await page.waitForFunction(before => ironRainTest.snapshot().ammo.HE === before - 1, ammo);
  await page.screenshot({ path: 'test-results/local-projectile-desktop.png' });
  await page.keyboard.press('Escape');
  await page.locator('#menuBtn').click();
  await page.locator('#strategicWarBtn').click();
  await page.waitForSelector('.strategic-war:not(.hidden)');
  await page.screenshot({ path: 'test-results/local-war-map.png' });

  // A process restart preserves the world, identity and spent shell. The live
  // client must reconnect without a reload before we also check the resume UI.
  await running.close();
  await page.waitForFunction(() => !ironRainEntry.runtime.status().connected);
  running = await startLocalGame({ port, dbPath });
  await page.waitForFunction(() => ironRainEntry.runtime.status().connected);
  assert.equal(await page.evaluate(() => ironRainEntry.runtime.status().mamuteId), mamute);
  await page.reload();
  await page.waitForSelector('.server-lobby[data-connected="true"]');
  await page.locator('[data-server-resume]').click();
  await page.waitForFunction(() => window.ironRainTest?.snapshot().cabin?.active);
  assert.equal(await page.evaluate(() => ironRainEntry.runtime.status().localId), identity);
  assert.equal(await page.evaluate(() => ironRainEntry.runtime.snapshot().theatreId), theatre);
  assert.equal(await page.evaluate(() => ironRainTest.snapshot().ammo.HE), ammo - 1);

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const mobile = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    phone.on('request', request => requests.push(request.url()));
    await phone.goto(`${origin}/?test=1`);
    await phone.waitForSelector('.server-lobby[data-connected="true"]');
    await phone.locator('[data-server-faction="axis"]').tap();
    for (const selector of ['[data-server-create]', '[data-server-faction="allies"]', '[data-server-faction="axis"]']) {
      await phone.locator(selector).scrollIntoViewIfNeeded();
      const box = await phone.locator(selector).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${selector} fits mobile`);
      assert.ok(box.height >= 44, `${selector} touch target`);
    }
    await phone.screenshot({ path: `test-results/local-lobby-${viewport.width}x${viewport.height}.png` });
    await mobile.close();
  }

  // A static public copy with no configured host explains local launch and
  // never silently falls back to a broker or an alternative simulation.
  const publicContext = await browser.newContext();
  const publicRequests = [];
  await publicContext.route('https://iron-rain-unconfigured.test/**', async route => {
    const url = new URL(route.request().url());
    const response = await fetch(origin + url.pathname + url.search);
    await route.fulfill({ status: response.status, body: Buffer.from(await response.arrayBuffer()),
      headers: { 'Content-Type': response.headers.get('content-type') || 'text/plain' } });
  });
  const publicPage = await publicContext.newPage();
  publicPage.on('request', request => publicRequests.push(request.url()));
  publicPage.on('pageerror', error => errors.push(error.message));
  await publicPage.goto('https://iron-rain-unconfigured.test/?test=1');
  await publicPage.waitForFunction(() => document.querySelector('[data-server-notice]')?.textContent.includes('ABRIR-IRON-RAIN'));
  assert.equal(await publicPage.locator('[data-server-create]').isDisabled(), true);
  await publicPage.waitForTimeout(800);
  assert.ok(publicRequests.every(url => url.startsWith('https://iron-rain-unconfigured.test/')));
  assert.ok(!publicRequests.some(url => /\/(identity|poll|command)$/.test(new URL(url).pathname)));

  const normalContext = await browser.newContext();
  const normalPage = await normalContext.newPage();
  normalPage.on('pageerror', error => errors.push(error.message));
  normalPage.on('request', request => requests.push(request.url()));
  await normalPage.goto(origin + '/');
  await normalPage.waitForSelector('.server-lobby[data-connected="true"]');
  await normalPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cached = await normalPage.evaluate(async () => {
    const names = await caches.keys();
    const files = [];
    for (const name of names) for (const request of await (await caches.open(name)).keys()) files.push(request.url);
    return { names, files, diagnostics: typeof window.ironRainTest };
  });
  assert.ok(cached.names.some(name => name.endsWith('v7.37')));
  assert.ok(cached.files.includes(origin + '/modules/server-endpoint.js'));
  assert.ok(cached.files.every(url => !url.includes('/war-api')));
  assert.equal(cached.diagnostics, 'undefined');
  assert.ok(requests.every(url => url.startsWith(origin + '/')), 'local play needs no external requests');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, localEntry: true, cabin: true, fireConsumesOneShell: true,
    map: true, processRestart: true, savedIdentity: true, mobileLayouts: 2, unconfiguredPublicPage: true, pwaShell: true, errors }));
} finally {
  await browser?.close();
  await running?.close();
  await rm(directory, { recursive: true, force: true });
}
