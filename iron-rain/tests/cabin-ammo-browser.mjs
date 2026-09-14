import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/tests/cabin-preview.html');
  await page.waitForFunction(() => window.cabin?.snapshot().renderer.drawCalls > 0);
  await page.evaluate(() => {
    data.ammo = { HE: 18, FRAG: 8, SMOKE: 8 };
    cabin.setPoseForTest({ x: .8, z: 1.55, yaw: -Math.PI / 2, pitch: -.16 });
  });
  await page.waitForFunction(() => cabin.snapshot().ammoDisplay?.rack.HE === 16);
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: 'test-results/cabin-ammo-full.png' });
  const initial = await page.evaluate(() => cabin.snapshot());
  assert.deepEqual(initial.ammoDisplay, { rack: { HE: 16, FRAG: 6, SMOKE: 6 }, magazine: { HE: 2, FRAG: 2, SMOKE: 2 } });
  await page.evaluate(() => { data.ammo = { HE: 17, FRAG: 8, SMOKE: 8 }; });
  await page.waitForFunction(() => cabin.snapshot().ammoDisplay.rack.HE === 15);
  await page.evaluate(() => { data.ammo = { HE: 0, FRAG: 0, SMOKE: 0 }; });
  await page.waitForFunction(() => cabin.snapshot().ammoDisplay.rack.HE === 0);
  await page.screenshot({ path: 'test-results/cabin-ammo-empty.png' });
  const empty = await page.evaluate(() => cabin.snapshot());
  assert.deepEqual(empty.ammoDisplay, { rack: { HE: 0, FRAG: 0, SMOKE: 0 }, magazine: { HE: 0, FRAG: 0, SMOKE: 0 } });
  assert.ok(empty.renderer.drawCalls < initial.renderer.drawCalls);
  assert.equal(empty.renderer.geometries, initial.renderer.geometries);
  await page.evaluate(() => { data.ammo = { HE: 18, FRAG: 8, SMOKE: 8 }; });
  await page.waitForFunction(() => cabin.snapshot().ammoDisplay.rack.HE === 16);
  assert.equal((await page.evaluate(() => cabin.snapshot().renderer)).geometries, initial.renderer.geometries);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, full: initial.ammoDisplay, empty: empty.ammoDisplay, geometries: initial.renderer.geometries, errors }));
} finally { await browser.close(); }
