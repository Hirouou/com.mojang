import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestAutoAdvance, cancelAutoAdvance, stepMarchAutopilot, autoAdvanceSnapshot } from '../modules/march-autopilot.js';
import { strategicWorldPoint, publishReconVisual } from '../modules/operator-enhancements.js';
import { stepTankTactics } from '../modules/tank-tactics.js';
import { stepCamera } from '../modules/camera-director.js';

function mamuteState(overrides = {}) {
  return {
    time: 0,
    paused: false,
    mode: 'artillery',
    view: 'cabin',
    station: 'map',
    robot: { x: 1000, y: 1000, armor: 100, speed: 0, facing: 0, turret: 0 },
    engine: { health: 100, fire: 0 },
    cam: { x: 1000, y: 1000, zoom: .78, targetZoom: .78, manualX: 0, manualY: 0, mode: 'follow' },
    warSimulation: { clock: 0 },
    sectors: [],
    ...overrides,
  };
}

test('strategic map point conversion preserves theatre coordinates', () => {
  const point = strategicWorldPoint({ clientX: 500, clientY: 300, left: 0, top: 0, width: 1000, height: 600 });
  assert.ok(Math.abs(point.x - 40000) < 1);
  assert.ok(Math.abs(point.y - 30000) < 1);
});

test('auto advance physically moves the Mamute at the existing off-road speed', () => {
  cancelAutoAdvance('test-reset');
  const state = mamuteState();
  const order = requestAutoAdvance({ x: 2000, y: 1000 });
  assert.equal(order.ok, true);
  assert.equal(stepMarchAutopilot(state, 1), true);
  assert.equal(state.mode, 'march');
  assert.equal(state.view, 'field');
  assert.ok(Math.abs(state.robot.x - 1038) < .01);
  assert.equal(state.robot.y, 1000);
  assert.ok(Math.abs(state.robot.speed - 38) < .01);
  assert.equal(autoAdvanceSnapshot(state).active, true);
  cancelAutoAdvance('test-end');
});

test('auto advance accepts the shared future road-speed seam without changing off-road base speed', () => {
  cancelAutoAdvance('test-reset');
  const previous = globalThis.ironRainStrategicMap;
  globalThis.ironRainStrategicMap = { roadSpeedMultiplier: () => 1.45 };
  const state = mamuteState();
  requestAutoAdvance({ x: 2000, y: 1000 });
  stepMarchAutopilot(state, 1);
  assert.ok(Math.abs(state.robot.speed - 55.1) < .02);
  cancelAutoAdvance('test-end');
  if (previous === undefined) delete globalThis.ironRainStrategicMap;
  else globalThis.ironRainStrategicMap = previous;
});

test('auto advance pauses instead of teleporting when the engine cannot drive', () => {
  cancelAutoAdvance('test-reset');
  const state = mamuteState({ engine: { health: 10, fire: 0 } });
  requestAutoAdvance({ x: 2000, y: 1000 });
  assert.equal(stepMarchAutopilot(state, 1), false);
  assert.equal(state.robot.x, 1000);
  assert.equal(autoAdvanceSnapshot(state).status, 'paused');
  cancelAutoAdvance('test-end');
});

test('tank tactics produce two-dimensional manoeuvre and damaged withdrawal', () => {
  const tank = { id: 'ALLY-T1', type: 'tank', team: 'ally', x: 4500, y: 5150, hp: 25, maxHp: 180, alive: true, angle: 0, speed: 0, flash: 0 };
  const enemyTank = { id: 'ENEMY-T1', type: 'tank', team: 'enemy', x: 5500, y: 5000, hp: 180, maxHp: 180, alive: true, angle: Math.PI, speed: 0, flash: 0 };
  const state = {
    time: 10,
    mode: 'march',
    robot: { x: 2000, y: 2000 },
    smokes: [],
    warSimulation: { clock: 10 },
    sectors: [{
      x: 5000, y: 5000,
      units: [],
      war: {
        positionOffset: 0,
        ally: { phase: 'retreat', advance: 0 }, enemy: { phase: 'hold', advance: 0 },
        bases: [{ team: 'ally', x: 4200, y: 4800, alive: true }, { team: 'enemy', x: 5800, y: 5200, alive: true }],
        vehicles: [tank, enemyTank],
      },
    }],
  };
  const yBefore = tank.y;
  stepTankTactics(state, 1);
  assert.equal(tank.tactic, 'repair-retreat');
  assert.notEqual(tank.y, yBefore);
  assert.ok(Number.isFinite(tank.hullAngle));
  assert.ok(Number.isFinite(tank.turretAngle));
});

test('march camera supports bounded operator zoom while preserving local scale', () => {
  cancelAutoAdvance('test-reset');
  const previous = globalThis.ironRainMarchZoomTarget;
  globalThis.ironRainMarchZoomTarget = .2;
  const state = mamuteState();
  stepCamera(state, .1, 1000);
  assert.equal(state.cam.targetZoom, .38);
  assert.ok(state.cam.zoom >= .38 && state.cam.zoom < .78);
  if (previous === undefined) delete globalThis.ironRainMarchZoomTarget;
  else globalThis.ironRainMarchZoomTarget = previous;
});

test('recon presentation tracks the real intelligence plane without changing intel', () => {
  const state = mamuteState({ intel: { source: 'plane', sourcePos: { x: 5000, y: 4000 }, elapsed: 2 } });
  publishReconVisual(state);
  assert.equal(globalThis.ironRainReconVisual.active, true);
  assert.equal(globalThis.ironRainReconVisual.y, 3740);
  assert.ok(globalThis.ironRainReconVisual.x > 4000);
});

test('mobile operator UI contains larger joysticks, zoom and strategic auto-advance controls', () => {
  const source = readFileSync(new URL('../modules/operator-enhancements.js', import.meta.url), 'utf8');
  assert.match(source, /march-ui>\.joystick\{width:142px;height:142px/);
  assert.match(source, /data-jarvis-zoom-out/);
  assert.match(source, /data-jarvis-zoom-in/);
  assert.match(source, /data-strategic-advance/);
  assert.match(source, /ironrain:auto-advance-request/);
  assert.match(source, /jarvisReconOverlay/);
});
