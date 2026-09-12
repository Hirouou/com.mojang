/** Fictional M-47 gameplay model. All dimensions use metres and seconds. */
export const GRAVITY = 9.81;
export const MIN_ELEVATION = 15;
export const MAX_ELEVATION = 80;
// Wind is a mild horizontal acceleration, independent of frame rate.
export const WIND_ACCELERATION = 0.0012;

/** Index matches the charge number shown on the breech. */
export const CHARGES = Object.freeze([
  null,
  ...[2800, 5500, 10500, 18000, 28000, 40000, 55000].map((maxRange, index) =>
    Object.freeze({ id: index + 1, label: `C${index + 1}`, maxRange, velocity: Math.sqrt(maxRange * GRAVITY) })
  ),
]);

const radians = degrees => degrees * Math.PI / 180;
const degrees = radians => radians * 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

/** Bearing unit vector in the same east-positive/south-positive world as the renderer. */
export function bearingVector(bearing) {
  const direction = radians(finite(bearing, 'bearing'));
  return Object.freeze({ x: Math.sin(direction), y: -Math.cos(direction) });
}

/** The one solution shared by the readout, table and projectile. */
export function ballistics(charge, elevation) {
  if (!Number.isInteger(charge) || !CHARGES[charge]) throw new RangeError('Unknown propellant charge');
  elevation = clamp(finite(elevation, 'elevation'), MIN_ELEVATION, MAX_ELEVATION);
  const v = CHARGES[charge].velocity;
  const angle = radians(elevation);
  const horizontalVelocity = v * Math.cos(angle);
  const verticalVelocity = v * Math.sin(angle);
  const tof = 2 * verticalVelocity / GRAVITY;
  return Object.freeze({
    charge, elevation, v, horizontalVelocity, verticalVelocity, gravity: GRAVITY,
    range: horizontalVelocity * tof,
    apex: verticalVelocity * verticalVelocity / (2 * GRAVITY),
    tof,
  });
}

/** The minimum is at one endpoint; 45 degrees gives the maximum. */
export function chargeBand(charge) {
  return {
    min: Math.min(ballistics(charge, MIN_ELEVATION).range, ballistics(charge, MAX_ELEVATION).range),
    max: ballistics(charge, 45).range,
  };
}

/**
 * Return every mechanically valid still-air elevation for a requested notebook range.
 * Short ranges may only have the high arc because the complementary low arc is below
 * the 15-degree mechanical stop. The maximum-range solution collapses to one 45-degree arc.
 */
export function elevationsForRange(charge, range) {
  range = finite(range, 'range');
  const band = chargeBand(charge);
  const tolerance = 1e-7;
  if (range < band.min - tolerance || range > band.max + tolerance) return Object.freeze([]);

  const ratio = clamp(range / CHARGES[charge].maxRange, -1, 1);
  const low = degrees(Math.asin(ratio)) / 2;
  const high = 90 - low;
  const solutions = [low, high]
    .filter(elevation => elevation >= MIN_ELEVATION - tolerance && elevation <= MAX_ELEVATION + tolerance)
    .map(elevation => clamp(elevation, MIN_ELEVATION, MAX_ELEVATION))
    .filter((elevation, index, values) => index === 0 || Math.abs(elevation - values[index - 1]) > tolerance);
  return Object.freeze(solutions);
}

/**
 * Bearing is clockwise from north: 0 = -Y, 90 = +X.
 * `time` is absolute simulated time since launch, not a frame delta.
 * A shell stops on the ground at its actual impact; world bounds never move it.
 * Readout range is nominal (still air); wind introduces a small physical drift.
 */
export function sampleTrajectory(solution, origin, bearing, wind = { x: 0, y: 0 }, time = 0) {
  const t = clamp(finite(time, 'time'), 0, solution.tof);
  const direction = bearingVector(bearing);
  const accelerationX = finite(wind?.x ?? 0, 'wind.x') * WIND_ACCELERATION;
  const accelerationY = finite(wind?.y ?? 0, 'wind.y') * WIND_ACCELERATION;
  const distance = solution.horizontalVelocity * t;
  const landed = time >= solution.tof;
  return {
    x: finite(origin.x, 'origin.x') + direction.x * distance + 0.5 * accelerationX * t * t,
    y: finite(origin.y, 'origin.y') + direction.y * distance + 0.5 * accelerationY * t * t,
    z: landed ? 0 : Math.max(0, solution.verticalVelocity * t - 0.5 * solution.gravity * t * t),
    t,
    landed,
  };
}
