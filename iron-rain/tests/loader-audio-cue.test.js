import test from 'node:test';
import assert from 'node:assert/strict';
import { loaderAudioCue } from '../modules/loader-audio-cue.js';
import { loaderActivity } from '../modules/loader-arm.js';

const cycle = (phase, progress, complete = false) => ({ phase, progress, complete });

test('emits one semantic cue for each real loader phase transition', () => {
  const cases = [
    ['idle', cycle('extract', .1), 'clamp'],
    ['extract', cycle('rotate', .35), 'swing'],
    ['rotate', cycle('ram', .75), 'ram'],
    ['ram', cycle('lock', .94), 'lock'],
  ];
  for (const [previous, current, expected] of cases) {
    const cue = loaderAudioCue(previous, current);
    assert.equal(cue.phase, current.phase);
    assert.equal(cue.cue, expected);
    assert.equal(Object.isFrozen(cue), true);
  }
});

test('does not retrigger while the loader remains in the same phase', () => {
  assert.equal(loaderAudioCue('rotate', cycle('rotate', .5)), null);
  assert.equal(loaderAudioCue('lock', cycle('lock', .98)), null);
  assert.equal(loaderAudioCue('idle', null), null);
  assert.equal(loaderAudioCue('ram', cycle('lock', 1, true)), null);
});

test('mechanical flags remain derived from loader-arm instead of a second clock', () => {
  const current = cycle('ram', .81);
  const cue = loaderAudioCue('rotate', current);
  const activity = loaderActivity(current);
  assert.equal(cue.heavyMotion, activity.heavyMotion);
  assert.equal(cue.rammer, activity.rammer);
  assert.equal(cue.heavyMotion, true);
  assert.ok(cue.rammer > 0 && cue.rammer < 1);
});
