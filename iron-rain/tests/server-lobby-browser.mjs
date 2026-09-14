import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { startWarServer } from '../server/http.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');
const server = startWarServer({ port: 0, dbPath: ':memory:' });
await new Promise(resolve => server.server.once('listening', resolve));
const endpoint = `http://127.0.0.1:${server.server.address().port}`;
// Distinct real server vehicles exercise the list and code-entry paths.
const fixtureVehicles = [];
for (let i = 0; i < 3; i++) {
  const identity = server.world.register(), player = server.world.authenticate(identity.token);
  server.world.heartbeat(player);
  const created = server.world.command(player, { id: `lobby-fixture-${i}`, sequence: 1, type: 'create', payload: { faction: 'allies' } });
  assert.ok(created.ok); fixtureVehicles.push(created);
}
const browser = await chromium.launch({ headless: true });
const errors = [], results = [];
await mkdir('test-results', { recursive: true });
try {
  for (const [caseIndex, viewport] of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 568, height: 320 }, { width: 1280, height: 720 }].entries()) {
    console.log('viewport', viewport.width, viewport.height);
    const mobile = viewport.width < 1000, chosen = fixtureVehicles[caseIndex % fixtureVehicles.length];
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const activate = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:4173/?test=1&server=${endpoint}`);
    await activate('[data-server-faction="allies"]');
    await page.waitForSelector('[data-server-join]');
    for (const selector of ['[data-server-faction="allies"]', '[data-server-faction="axis"]', '[data-server-create]', '[data-server-spawn]', '[data-server-code]', '[data-server-code-join]']) {
      const node = page.locator(selector); await node.scrollIntoViewIfNeeded();
      const box = await node.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${selector} touch target`);
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${selector} horizontal bounds`);
    }
    await page.locator('.server-lobby-body').evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: `test-results/server-lobby-${viewport.width}x${viewport.height}.png` });
    if (mobile) {
      const list = page.locator('[data-server-list]'); await list.scrollIntoViewIfNeeded();
      const dimensions = await list.evaluate(node => ({ total: node.scrollHeight, height: node.clientHeight }));
      if (dimensions.total > dimensions.height + 4) {
        const session = await context.newCDPSession(page), box = await list.boundingBox(), x = box.x + box.width / 2;
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: box.y + box.height - 8, id: 1 }] });
        for (let i = 1; i <= 10; i++) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: box.y + box.height - 8 - (box.height - 16) * i / 10, id: 1 }] }); await page.waitForTimeout(20); }
        await page.waitForTimeout(100);
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => document.querySelector('[data-server-list]').scrollTop > 0);
        await page.waitForTimeout(1200);
      }
    }
    await page.locator('[data-server-code]').fill('INVALID-CODE');
    await activate('[data-server-code-join]');
    await page.waitForFunction(() => document.querySelector('[data-server-notice]').textContent.includes('Não foi possível'));
    await page.waitForTimeout(450);
    assert.match(await page.locator('[data-server-notice]').innerText(), /Não foi possível/, 'action failure remains readable after poll refresh');
    await page.locator('[data-server-code]').fill(chosen.code);
    await page.locator('[data-server-code]').press('Enter');
    await page.waitForFunction(() => window.ironRainTest?.snapshot().cabin?.active);
    assert.equal(await page.evaluate(() => ironRainEntry.runtime.status().mamuteId), chosen.mamuteId);
    await activate('#menuBtn');
    const code = await page.locator('#crewInviteCode').innerText(); assert.equal(code, chosen.code);
    const menu = await page.locator('#menu .menu-card').boundingBox();
    assert.ok(menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= viewport.width + 1 && menu.y + menu.height <= viewport.height + 1, 'menu inside viewport');
    const panel = page.locator('#settingsGamePanel');
    const before = await panel.evaluate(node => ({ top: node.scrollTop, height: node.clientHeight, total: node.scrollHeight }));
    await page.screenshot({ path: `test-results/server-menu-${viewport.width}x${viewport.height}.png` });
    if (before.total > before.height + 3) {
      const session = await context.newCDPSession(page), box = await panel.boundingBox(), x = box.x + box.width / 2;
      const from = box.y + box.height - 14, to = box.y + 10;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from, id: 1 }] });
      for (let i = 1; i <= 10; i++) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / 10, id: 1 }] }); await page.waitForTimeout(20); }
      await page.waitForTimeout(100);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.getElementById('settingsGamePanel').scrollTop > 0);
      await page.waitForTimeout(1200);
    }
    await activate('#settingsSoundTab');
    assert.equal(await page.locator('#settingsSoundPanel').isVisible(), true);
    await page.locator('#masterVolume').scrollIntoViewIfNeeded();
    await activate('#settingsGameTab');
    await activate('#resumeBtn');
    assert.equal(await page.locator('#menu').isVisible(), false);
    results.push({ viewport, menu, code, nativeScrollNeeded: before.total > before.height + 3 });
    await context.close();
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, results, codeEntry: true, errorPersists: true, errors }));
} finally { await browser.close(); await server.close(); }
