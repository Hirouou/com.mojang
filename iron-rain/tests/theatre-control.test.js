import test from 'node:test';
import assert from 'node:assert/strict';
import { controlLineX, territoryAt, createFrontAnchors, DEFAULT_CONTROL_LINE, shiftControlLine } from '../modules/theatre-control.js';

test('all tactical front anchors stay on one ordered control line', () => {
  const anchors = createFrontAnchors({ count: 7 });
  assert.equal(anchors.length, 7);
  for (let i = 0; i < anchors.length; i++) {
    assert.equal(anchors[i].x, controlLineX(anchors[i].y));
    if (i) assert.ok(anchors[i].y > anchors[i - 1].y);
  }
});

test('territory is classified consistently west/east of the front', () => {
  const y = 30_000, line = controlLineX(y);
  assert.equal(territoryAt({ x: line - 2_000, y }), 'ally');
  assert.equal(territoryAt({ x: line + 2_000, y }), 'enemy');
  assert.equal(territoryAt({ x: line, y }), 'contested');
});

test('capturing ground bends a local section instead of spawning a disconnected front', () => {
  const moved = shiftControlLine(DEFAULT_CONTROL_LINE, 32_000, 1_000, 9_000);
  assert.ok(controlLineX(32_000, moved) > controlLineX(32_000, DEFAULT_CONTROL_LINE));
  assert.equal(controlLineX(0, moved), controlLineX(0, DEFAULT_CONTROL_LINE));
});
