import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtilleryShotReplayGuard } from '../modules/artillery-shot-replay-guard.js';

test('artillery shot replay guard accepts legacy effects without identity', () => {
  const guard = createArtilleryShotReplayGuard();
  assert.equal(guard.accept(null), true);
  assert.equal(guard.accept(''), true);
});

test('artillery shot replay guard rejects duplicate shot ids', () => {
  const guard = createArtilleryShotReplayGuard();
  assert.equal(guard.accept('mamute-a:gunner:17'), true);
  assert.equal(guard.accept('mamute-a:gunner:17'), false);
  assert.equal(guard.accept('mamute-a:gunner:18'), true);
});

test('artillery shot replay guard stays bounded and expires oldest ids', () => {
  const guard = createArtilleryShotReplayGuard(2);
  assert.equal(guard.accept('shot-1'), true);
  assert.equal(guard.accept('shot-2'), true);
  assert.equal(guard.accept('shot-3'), true);
  assert.equal(guard.accept('shot-1'), true);
});

test('artillery shot replay guard reset allows a known identity again', () => {
  const guard = createArtilleryShotReplayGuard();
  assert.equal(guard.accept('shot-reset'), true);
  assert.equal(guard.accept('shot-reset'), false);
  guard.reset();
  assert.equal(guard.accept('shot-reset'), true);
});
