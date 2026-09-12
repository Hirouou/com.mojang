const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/**
 * Wall-clock strategic scheduler. It is intentionally independent from
 * requestAnimationFrame/performance.now(), so an authoritative world can keep
 * advancing when a crew client disconnects. Storage/network authority lives
 * outside this module.
 */
export function createPersistentWarClock({
  stepSeconds = 1,
  lastWallMs = Date.now(),
  simulatedSeconds = 0,
  maxCatchUpSeconds = 6 * 60 * 60,
} = {}) {
  const step = Math.max(.25, finite(stepSeconds, 1));
  const maxCatchUp = Math.max(step, finite(maxCatchUpSeconds, 21_600));
  let wall = Math.max(0, finite(lastWallMs, Date.now()));
  let simulated = Math.max(0, finite(simulatedSeconds));
  let remainder = 0;

  function advance(nowMs = Date.now()) {
    const nextWall = Math.max(wall, finite(nowMs, wall));
    const elapsed = Math.min(maxCatchUp, Math.max(0, (nextWall - wall) / 1000));
    wall = nextWall;
    remainder += elapsed;
    const ticks = Math.floor(remainder / step);
    const advanced = ticks * step;
    remainder -= advanced;
    simulated += advanced;
    return Object.freeze({ ticks, stepSeconds: step, advancedSeconds: advanced, simulatedSeconds: simulated, remainderSeconds: remainder, lastWallMs: wall });
  }

  function snapshot() {
    return Object.freeze({ stepSeconds: step, lastWallMs: wall, simulatedSeconds: simulated, remainderSeconds: remainder, maxCatchUpSeconds: maxCatchUp });
  }

  return Object.freeze({ advance, snapshot });
}
