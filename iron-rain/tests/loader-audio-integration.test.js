import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../game-v6.js', import.meta.url), 'utf8');

test('game loop consumes canonical loader audio cues instead of generic phase contacts', () => {
  assert.match(source, /import \{ loaderAudioCue \} from '\.\/modules\/loader-audio-cue\.js';/);
  assert.match(source, /loaderAudioCue\(oldPhase,state\.loading\)/);
  assert.match(source, /if\(loaderCue\)audio\.load\(loaderCue\)/);
  assert.doesNotMatch(source, /if\(oldPhase!==state\.loading\.phase\)audio\.load\?\.\(\)/);
});

test('manual shell selection emits the canonical extract cue immediately', () => {
  assert.match(source, /loaderAudioCue\(null,state\.loading\)/);
});
