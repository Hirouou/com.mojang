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
    await page.addInitScript(() => addEventListener('ironrain:cabin-ready', e => { window.__recoveryCabin = e.detail.cabin; }));
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
    if (touch) {
      assert.equal(await page.locator('#azWheel').isVisible(), false);
      assert.equal(await page.locator('#elWheel').isVisible(), false);
      for (const id of ['chargeUp', 'chargeDown', 'fireBtn', 'leaveStationBtn']) {
        const b = await page.locator(`#${id}`).boundingBox();
        assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 845 && b.y + b.height <= 391, `${id} fits viewport`);
        assert.ok(b.height >= 40, `${id} touch target`);
      }
      await page.evaluate(() => window.ironRainTest.advance(.8));
      const before = (await snapshot()).azTarget;
      const bounds = await page.evaluate(() => window.__recoveryCabin.getWheelBounds().azimuth);
      const cdp = await page.context().newCDPSession(page);
      const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2, r = bounds.width * .35;
      await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:cx+r,y:cy}] });
      for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:cx+r*Math.cos(i*Math.PI/16),y:cy+r*Math.sin(i*Math.PI/16)}] });
      await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
      assert.ok(Math.abs((await snapshot()).azTarget-before)>.05, 'physical crank receives touch drag');
      await page.screenshot({ path:'test-results/mobile-aim-restored.png' });
      await page.locator('#leaveStationBtn').tap();
    }
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
