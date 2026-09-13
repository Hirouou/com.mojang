import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { startWarServer } from '../server/http.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');
const server = startWarServer({ port: 0, dbPath: ':memory:' });
await new Promise(resolve => server.server.once('listening', resolve));
const endpoint = `http://127.0.0.1:${server.server.address().port}`;
const browser = await chromium.launch({ headless: true });
await mkdir('test-results', { recursive: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:4173/?test=1&server=${endpoint}`);
  await page.locator('[data-server-faction="allies"]').tap();
  await page.locator('[data-server-create]').tap();
  await page.waitForFunction(() => window.ironRainTest?.snapshot().cabin?.active);
  await page.evaluate(() => ironRainTest.setPose({ x: 0, z: 0, yaw: 0, pitch: 0 }));
  await page.locator('#interactBtn').tap();
  await page.waitForFunction(() => ironRainTest.snapshot().station === 'aim');
  const selectors = ['#azWheel', '#elWheel', '#chargeDown', '#chargeUp', '#fireBtn', '#rangeReadout'];
  const layouts = [];
  for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({ width, height }) => document.getElementById('app').clientWidth === width && document.getElementById('app').clientHeight === height, viewport);
    const boxes = {};
    for (const selector of selectors) {
      const element = page.locator(selector);
      assert.ok(await element.isVisible(), `${selector} visible at ${viewport.width}x${viewport.height}`);
      const box = await element.boundingBox();
      boxes[selector] = box;
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} inside viewport: ${JSON.stringify(box)}`);
      if (selector !== '#rangeReadout') assert.ok(box.width >= 44 && box.height >= 44, `${selector} has a usable touch target`);
      assert.ok(await element.evaluate(node => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), `${selector} is not covered by another panel at ${viewport.width}`);
    }
    for (let a = 0; a < selectors.length; a++) for (let b = a + 1; b < selectors.length; b++) {
      const x = boxes[selectors[a]], y = boxes[selectors[b]];
      assert.ok(x.x + x.width <= y.x + 1 || y.x + y.width <= x.x + 1 || x.y + x.height <= y.y + 1 || y.y + y.height <= x.y + 1, `${selectors[a]} overlaps ${selectors[b]} at ${viewport.width}`);
    }
    assert.ok(boxes['#azWheel'].x < boxes['#fireBtn'].x && boxes['#elWheel'].x > boxes['#fireBtn'].x, 'thumb dials flank the fire control');
    assert.ok(boxes['#rangeReadout'].y >= boxes['#azWheel'].y + boxes['#azWheel'].height, 'range stays below the dials');
    assert.match(await page.locator('#rangeReadout').innerText(), /ALCANCE\s+[\d.]+ m/);
    await page.screenshot({ path: `test-results/mobile-aim-${viewport.width}x${viewport.height}.png` });
    layouts.push({ viewport, boxes });
  }
  const session = await context.newCDPSession(page);
  async function turn(selector) {
    const box = await page.locator(selector).boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, radius = box.width * .38;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx + radius, y: cy, id: 1 }] });
    for (let step = 1; step <= 12; step++) {
      const angle = step * Math.PI / 12;
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, id: 1 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const before = await page.evaluate(() => ironRainTest.snapshot());
  await turn('#azWheel');
  await page.waitForFunction(value => Math.abs(ironRainTest.snapshot().bearing - value) > 2, before.bearing);
  await turn('#elWheel');
  await page.waitForFunction(value => Math.abs(ironRainTest.snapshot().elev - value) > 2, before.elev);
  const range = await page.locator('#rangeReadout').innerText();
  await page.locator('#chargeDown').tap();
  await page.waitForFunction(value => ironRainTest.snapshot().charge === value - 1, before.charge);
  await page.waitForFunction(value => document.getElementById('rangeReadout').innerText !== value, range);
  await page.locator('#menuBtn').tap();
  assert.equal(await page.locator('#fireDeck').isVisible(), false, 'aim panel cannot intercept menu touches');
  await page.locator('#resumeBtn').tap();
  await page.locator('#leaveStationBtn').tap();
  await page.waitForFunction(() => !ironRainTest.snapshot().station);
  assert.equal(await page.locator('#fireDeck').isVisible(), false, 'panel closes when walking resumes');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, layouts, touchAim: true, touchCharge: true, rangeVisible: true, menuHidden: true, errors }));
} finally {
  await browser.close();
  await server.close();
}
