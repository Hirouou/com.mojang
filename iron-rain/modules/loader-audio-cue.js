import { loaderActivity } from './loader-arm.js';

const CUES = Object.freeze({
  extract: Object.freeze({ cue: 'clamp', intensity: 0.55 }),
  rotate: Object.freeze({ cue: 'swing', intensity: 0.72 }),
  ram: Object.freeze({ cue: 'ram', intensity: 1 }),
  lock: Object.freeze({ cue: 'lock', intensity: 0.62 }),
});

/**
 * Returns one semantic audio cue when the existing loader clock changes phase.
 *
 * This deliberately owns no timer and no playback state. Callers pass the
 * previous phase they already observed; the mechanical motion still comes
 * exclusively from loader-arm.js / the loading cycle.
 */
export function loaderAudioCue(previousPhase, cycle) {
  if (!cycle || cycle.complete) return null;
  const activity = loaderActivity(cycle);
  const phase = String(cycle.phase || 'idle');
  if (phase === previousPhase || !CUES[phase]) return null;
  const profile = CUES[phase];
  return Object.freeze({
    phase,
    cue: profile.cue,
    intensity: profile.intensity,
    heavyMotion: activity.heavyMotion,
    rammer: activity.rammer,
  });
}
