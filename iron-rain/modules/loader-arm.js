/**
 * Visual choreography for the Mamute automatic loader.
 *
 * This module deliberately contains no ballistic/weapon data. It only maps the
 * existing fictional loading-cycle clock into a readable low-poly mechanism:
 * grab -> lift -> rotate -> align -> ram -> lock.
 */
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * smooth(t);

export const LOADER_ARM_HOME = Object.freeze({
  baseYaw: -0.72,
  shoulder: -0.42,
  elbow: 1.08,
  claw: 0.18,
  extension: 0,
});

/**
 * Returns normalized mechanism pose for the visual arm.
 * `progress` is the existing loading-cycle progress [0..1].
 */
export function loaderArmPose(cycle) {
  if (!cycle) return Object.freeze({ ...LOADER_ARM_HOME, gripping: false, rammer: 0, phase: 'idle', shellVisible: false });

  const p = clamp01(cycle.progress);
  const phase = cycle.phase || (p < .22 ? 'extract' : p < .62 ? 'rotate' : p < .9 ? 'ram' : 'lock');
  let baseYaw = LOADER_ARM_HOME.baseYaw;
  let shoulder = LOADER_ARM_HOME.shoulder;
  let elbow = LOADER_ARM_HOME.elbow;
  let claw = LOADER_ARM_HOME.claw;
  let extension = 0;
  let rammer = 0;
  let gripping = true;
  let shellVisible = true;

  if (phase === 'extract') {
    const t = p / .22;
    // Reach into the carousel and positively clamp the chosen round. The
    // renderer must not show the round in the claw during the empty approach,
    // otherwise it looks duplicated beside the magazine before pickup.
    baseYaw = mix(-.72, -.28, t);
    shoulder = mix(-.42, -.78, t);
    elbow = mix(1.08, .62, t);
    claw = mix(.18, .03, Math.min(1, t * 1.7));
    extension = mix(0, .34, t);
    shellVisible = t >= .55;
  } else if (phase === 'rotate') {
    const t = (p - .22) / .40;
    // Pull clear first, then swing toward the breech. The small shoulder arc
    // keeps the shell from looking like it is floating in a straight line.
    baseYaw = mix(-.28, 1.18, t);
    shoulder = mix(-.78, -.2 + Math.sin(clamp01(t) * Math.PI) * .18, t);
    elbow = mix(.62, .9, t);
    claw = .03;
    extension = mix(.34, .18, t);
  } else if (phase === 'ram') {
    const t = (p - .62) / .28;
    baseYaw = mix(1.18, 1.34, t);
    shoulder = mix(-.2, -.08, t);
    elbow = mix(.9, .48, t);
    claw = .03;
    extension = mix(.18, .42, t);
    rammer = smooth(t);
  } else {
    const t = (p - .9) / .1;
    // Hold the arm fully seated for the first part of lock. The claw releases
    // only after that dwell; retraction starts afterwards so the mechanism no
    // longer appears to pull away while it is still clamping the round.
    const releaseAt = .22;
    const retract = clamp01((t - releaseAt) / (1 - releaseAt));
    baseYaw = mix(1.34, LOADER_ARM_HOME.baseYaw, retract);
    shoulder = mix(-.08, LOADER_ARM_HOME.shoulder, retract);
    elbow = mix(.48, LOADER_ARM_HOME.elbow, retract);
    claw = mix(.03, LOADER_ARM_HOME.claw, retract);
    extension = mix(.42, 0, retract);
    rammer = 1 - smooth(retract);
    gripping = t < releaseAt;
    shellVisible = t < .28;
  }

  return Object.freeze({ baseYaw, shoulder, elbow, claw, extension, rammer, gripping, shellVisible, phase });
}

/**
 * Renderer-facing rig state derived from the same loader clock.
 *
 * The shell ownership is explicit so cabin renderers do not invent a second
 * free-floating shell trajectory: while visible it belongs to the claw until
 * the lock phase releases it into the breech. Geometry dimensions and world
 * anchors remain renderer concerns.
 */
export function loaderRigState(cycle) {
  const pose = loaderArmPose(cycle);
  const active = pose.phase !== 'idle' && !(cycle?.complete);
  const shellOwner = !pose.shellVisible ? null : pose.gripping ? 'claw' : 'breech';
  return Object.freeze({
    active,
    phase: pose.phase,
    joints: Object.freeze({
      baseYaw: pose.baseYaw,
      shoulder: pose.shoulder,
      elbow: pose.elbow,
      claw: pose.claw,
      extension: pose.extension,
      rammer: pose.rammer,
    }),
    shell: Object.freeze({
      visible: pose.shellVisible,
      owner: shellOwner,
      clamped: shellOwner === 'claw',
      seated: shellOwner === 'breech',
    }),
  });
}

/** Mechanical activity for sound/VFX without allocating extra state. */
export function loaderActivity(cycle) {
  const pose = loaderArmPose(cycle);
  return Object.freeze({
    moving: pose.phase !== 'idle' && !(cycle?.complete),
    heavyMotion: pose.phase === 'rotate' || pose.phase === 'ram',
    clampClosed: pose.gripping,
    rammer: pose.rammer,
  });
}
