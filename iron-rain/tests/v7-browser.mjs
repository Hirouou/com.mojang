import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto('http://localhost:4173/?test=1');
await page.waitForFunction(() => window.ironRainTest?.snapshot().cabin?.active);
await page.waitForTimeout(100);

const initial = await page.evaluate(() => window.ironRainTest.snapshot());
assert.equal(initial.cabin.active, true);
assert.equal(initial.reports.length, 0, 'fog of war starts without revealed reports');

// The commander transmission appears in the radio but does not reveal a
// target or create a mission until the operator opens it.
await page.evaluate(() => window.ironRainTest.advance(6));
let queued = await page.evaluate(() => window.ironRainTest.snapshot());
assert.ok(queued.intelQueue.some(item => item.kind === 'mission'));
assert.equal(queued.reports.length, 0);
const walkStart = await page.evaluate(() => window.ironRainTest.snapshot().cabin.position);
await page.keyboard.down('w');
// Drive a deterministic simulation slice while the real key is held.  A
// software WebGL renderer can spend longer than a frame in draw(), so a wall
// clock wait alone occasionally samples the first RAF before locomotion has
// advanced.  The diagnostic clock still exercises the browser key event and
// the same production update path used by the live loop.
await page.evaluate(() => window.ironRainTest.advance(.35));
await page.keyboard.up('w');
const walkEnd = await page.evaluate(() => window.ironRainTest.snapshot().cabin.position);
assert.ok(walkEnd.z < walkStart.z - .05, `W should move the cabin operator (${walkStart.z} → ${walkEnd.z})`);
await page.click('#menuBtn');
await page.click('#radioBtn');
await page.waitForSelector('#radio [data-intel-id]');
await page.locator('#radio [data-intel-id]').first().click();
await page.evaluate(() => window.ironRainTest.advance(7));
let briefed = await page.evaluate(() => window.ironRainTest.snapshot());
assert.equal(briefed.station, null);
assert.equal(briefed.cam.mode, 'follow');
assert.ok(briefed.reports.length >= 1);
assert.ok(briefed.mission, 'commander order is created after the report cinematic');

// Leaving the trench line exposes the Mamute to nearby enemy weapons.
await page.evaluate(() => window.ironRainTest.setMode('march'));
await page.evaluate(() => window.ironRainTest.advance(3.4));
const exposed = await page.evaluate(() => window.ironRainTest.snapshot());
assert.ok(exposed.robot.armor < 100, 'nearby enemy fire must reach an exposed Mamute');
await page.evaluate(() => window.ironRainTest.setMode('artillery'));

// Aim interaction and A/Q charge controls work without trapping the station.
await page.evaluate(() => window.ironRainTest.setPose({ x: -.21, z: -.62, yaw: 0 }));
await page.click('#interactBtn');
let atAim = await page.evaluate(() => window.ironRainTest.snapshot());
assert.equal(atAim.station, 'aim');
const beforeCharge = atAim.charge;
await page.keyboard.press('A');
let raised = await page.evaluate(() => window.ironRainTest.snapshot());
assert.equal(raised.charge, Math.min(7, beforeCharge + 1));
await page.keyboard.press('Escape');
assert.equal((await page.evaluate(() => window.ironRainTest.snapshot())).station, null);

// Menu controls are dark, readable, and the PC-only key panel is available.
await page.click('#menuBtn');
await page.click('#settingsKeysTab');
const style = await page.locator('[data-bind="fire"]').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
assert.notEqual(style.bg, 'rgb(255, 255, 255)');
assert.notEqual(style.color, 'rgb(255, 255, 255)');

if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ initial, queued, briefed, raised, keyButton: style }));
await browser.close();
