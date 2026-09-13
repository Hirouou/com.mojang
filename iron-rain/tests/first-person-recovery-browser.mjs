import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ headless: true });
const url = process.env.BASE_URL || 'http://localhost:4173/';
const results = [];
try {
  for (const touch of [false, true]) {
    const page = await browser.newPage({ viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 720 }, isMobile: touch, hasTouch: touch });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${url}?test=1`);
    await page.locator('[data-crew-faction="allies"]').click();
    await page.locator('[data-crew-offline]').click();
    await page.waitForFunction(() => window.ironRainTest?.snapshot().cabin?.active);
    const snapshot = () => page.evaluate(() => window.ironRainTest.snapshot());
    const start = await snapshot();
    await page.keyboard.down('w');
    await page.evaluate(() => window.ironRainTest.advance(.3));
    await page.keyboard.up('w');
    const walked = await snapshot();
    assert.ok(walked.cabin.position.z < start.cabin.position.z - .1);
    await page.evaluate(() => window.ironRainTest.setPose({ x: -.21, z: -.62, yaw: 0 }));
    await page.locator('#interactBtn').click();
    assert.equal((await snapshot()).station, 'aim');
    await page.keyboard.press('Escape');
    assert.equal((await snapshot()).station, null);
    await page.evaluate(() => window.ironRainTest.advance(2));
    const end = await snapshot();
    assert.equal(end.view, 'cabin');
    assert.equal(end.cabinFailed, false);
    assert.ok(end.cabin.renderer.drawCalls > 100);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `test-results/recovery-${touch ? 'mobile' : 'desktop'}.png` });
    results.push({ touch, view: end.view, travelled: walked.cabin.travelled, drawCalls: end.cabin.renderer.drawCalls, errors });
    await page.close();
  }
  console.log(JSON.stringify({ url, results }));
} finally { await browser.close(); }
